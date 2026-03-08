/**
 * Message queue management with BullMQ and Redis
 */

const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const { INGEST__REDIS_URL, INGEST__ENABLE_DLQ } = require('./config');

let redis;
let redisConn;
let queue;
let dlQueue;

/**
 * Create queue and optional dead letter queue
 */
function create() {
    redis = new IORedis(INGEST__REDIS_URL, { maxRetriesPerRequest: 5 });
    redisConn = new IORedis(INGEST__REDIS_URL, { maxRetriesPerRequest: null });
    
    queue = new Queue('sdr-messages', {
        connection: redis,
        defaultJobOptions: {
            attempts: 10,
            backoff: {
                type: 'exponential',
                delay: 1000,
            },
        }
    });

    if (ENABLE_DLQ) {
        dlQueue = new Queue('sdr-messages-dlq', {
            connection: redis,
            defaultJobOptions: {
                removeOnComplete: false,
                removeOnFail: false
            }
        });
        console.log('[DLQ] Dead Letter Queue enabled');
    }

    queue.on('error', (err) => {
        console.error('[QUEUE] Queue error:', err.message);
    });
}

/**
 * Add a message to the queue
 */
async function addMessage(message) {
    try {
        const job = await queue.add('message', message, {
            removeOnComplete: true,
            removeOnFail: false
        });
        console.log('[AGENT] Enqueued message, job:', job.id);
        return job;
    } catch (err) {
        console.error('[AGENT] Failed to enqueue job:', err.message);
        throw err;
    }
}

/**
 * Move a failed job to the dead letter queue
 */
async function moveToDeadLetterQueue(jobId, message, error, attempts) {
    if (!INGEST__ENABLE_DLQ || !dlQueue) return;

    try {
        await dlQueue.add('message', {
            originalJobId: jobId,
            message: message,
            error: error,
            timestamp: new Date().toISOString(),
            attempts: attempts
        });
        console.log('[DLQ] Moved job', jobId, 'to DLQ');
    } catch (err) {
        console.error('[DLQ] Failed to move to DLQ:', err.message);
    }
}

/**
 * Get all failed jobs
 */
async function getFailedJobs() {
    try {
        return await queue.getFailed();
    } catch (err) {
        console.error('[QUEUE] Error getting failed jobs:', err.message);
        return [];
    }
}

/**
 * Get queue statistics
 */
async function getStats() {
    try {
        return {
            active: await queue.getActiveCount(),
            waiting: await queue.getWaitingCount(),
            failed: await queue.getFailedCount(),
            completed: await queue.getCompletedCount()
        };
    } catch (err) {
        console.error('[QUEUE] Error getting stats:', err.message);
        return null;
    }
}

/**
 * Close all queues and connections
 */
async function close() {
    try {
        if (dlQueue) await dlQueue.close();
        if (queue) await queue.close();
        if (redis) await redis.quit();
        if (redisConn) await redisConn.disconnect();
    } catch (err) {
        console.error('[QUEUE] Error closing:', err.message);
        throw err;
    }
}

/**
 * Get the queue instance (for worker attachment)
 */
function getQueue() {
    return queue;
}

/**
 * Get the redis connection (for worker)
 */
function getRedisConnection() {
    return redisConn;
}

module.exports = {
    create,
    addMessage,
    moveToDeadLetterQueue,
    getFailedJobs,
    getStats,
    close,
    getQueue,
    getRedisConnection
};
