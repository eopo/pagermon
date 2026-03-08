/**
 * Worker process - processes messages from queue and sends to API
 */

const { Worker } = require('bullmq');

const { INGEST__API_URL, INGEST__API_KEY } = require('../config');
const circuitBreaker = require('../circuitBreaker');
const { normalizeMessage, validateMessage } = require('../message');
const queue = require('./queue');

const version = require('../../package.json').version;

let worker;

/**
 * Check if error is transient (should be retried)
 */
function isTransientError(error) {
  if (!error) return false;

  return (
    error.name === 'AbortError' ||
    error.code === 'ECONNREFUSED' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ENOTFOUND' ||
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('ETIMEDOUT') ||
    error.message.includes('ENOTFOUND') ||
    error.message.includes('Circuit breaker')
  );
}

/**
 * Check HTTP status code - is it transient?
 */
function isTransientStatus(status) {
  return [503, 504, 408, 429].includes(status);
}

/**
 * Create and start the worker
 */
function create() {
  worker = new Worker(
    'sdr-messages',
    async (job) => {
      const message = normalizeMessage(job.data || {});

      // Ensure message has required fields (backward compatibility with old jobs)
      const validation = validateMessage(message);
      if (!validation.valid) {
        console.error(`[WORKER] Invalid message format (${validation.reason}):`, message);
        throw new Error(`Invalid message format (${validation.reason})`);
      }

      const msgStr = JSON.stringify(message).substring(0, 100);
      console.log('[WORKER] Processing:', msgStr);

      // Check circuit breaker
      if (circuitBreaker.isOpen()) {
        const err = new Error('Circuit breaker is open - API unavailable');
        console.warn('[WORKER]', err.message);
        throw err;
      }

      try {
        const response = await fetch(`${INGEST__API_URL}/api/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: INGEST__API_KEY,
            'User-Agent': `pagermon-ingest/${version}`,
          },
          body: JSON.stringify(message),
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          const isTransient = isTransientStatus(response.status);
          const error = new Error(`HTTP ${response.status} ${response.statusText}`);

          circuitBreaker.updateState(!isTransient);

          if (isTransient) {
            console.error('[WORKER] Transient error (will retry):', error.message);
            throw error;
          } else {
            console.error('[WORKER] Permanent error (moving to DLQ):', error.message);

            await queue.moveToDeadLetterQueue(job.id, message, error.message, job.attemptsMade);

            return { error: error.message, dlq: true };
          }
        }

        const responseBody = await response.text();
        circuitBreaker.updateState(true);
        console.log('[WORKER] Transmitted, ID:', responseBody.substring(0, 50));
        return { success: true, messageId: responseBody };
      } catch (error) {
        const isTransient = isTransientError(error);

        if (isTransient) {
          circuitBreaker.updateState(false);
          console.error('[WORKER] Transient error (will retry):', error.message);
          throw error;
        } else {
          console.error('[WORKER] Permanent error (moving to DLQ):', error.message);

          await queue.moveToDeadLetterQueue(job.id, message, error.message, job.attemptsMade);

          return { error: error.message, dlq: true };
        }
      }
    },
    {
      connection: queue.getRedisConnection(),
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[WORKER] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[WORKER] Job ${job.id} failed: ${err.message}`);
  });
}

/**
 * Close the worker
 */
async function close() {
  if (worker) {
    console.log('[MAIN] Closing worker...');
    await worker.close();
  }
}

module.exports = {
  create,
  close,
};
