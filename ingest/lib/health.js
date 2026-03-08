/**
 * Health check logic for API availability monitoring
 * Tests the actual API endpoint used for message transmission
 */

const { INGEST__API_URL, INGEST__API_KEY } = require('./config');
const circuitBreaker = require('./circuitBreaker');
const queue = require('./queue');

let isHealthy = false;
let healthCheckInterval;

/**
 * Perform a health check against the PagerMon API
 * Uses GET /api/messages to verify API availability
 */
async function check() {
    try {
        const response = await fetch(`${INGEST__API_URL}/api/messages`, {
            method: 'GET',
            headers: {
                'apikey': INGEST__API_KEY
            },
            signal: AbortSignal.timeout(5000)
        });
        
        const healthy = response.ok || response.status === 401; // 401 means API is up, just auth check
        
        if (healthy !== isHealthy) {
            isHealthy = healthy;
            console.log(`[HEALTH] API is ${healthy ? 'UP' : 'DOWN'}`);
            
            // Trigger recovery when API comes back online and circuit is closed
            if (healthy && circuitBreaker.getState().state === 'CLOSED') {
                await processFailedJobs();
            }
        }
        
        return healthy;
    } catch (error) {
        if (isHealthy) {
            isHealthy = false;
            console.warn(`[HEALTH] API check failed: ${error.message}`);
        }
        return false;
    }
}

/**
 * Retry all previously failed jobs
 */
async function processFailedJobs() {
    try {
        const failed = await queue.getFailedJobs();
        
        if (failed.length > 0) {
            console.log(`[RECOVERY] Found ${failed.length} failed jobs, retrying...`);
            
            let retried = 0;
            let errors = 0;
            
            for (const failedJob of failed) {
                try {
                    await failedJob.retry();
                    retried++;
                    console.log(`[RECOVERY] Retried job ${failedJob.id}`);
                } catch (err) {
                    errors++;
                    console.error(`[RECOVERY] Failed to retry job ${failedJob.id}: ${err.message}`);
                }
            }
            
            console.log(`[RECOVERY] Summary: ${retried} retried, ${errors} errors`);
        }
    } catch (err) {
        console.error('[RECOVERY] Error processing failed jobs:', err.message);
    }
}

/**
 * Start health check interval
 */
function start() {
    console.log('[HEALTH] Starting API health checks');
    check();
    healthCheckInterval = setInterval(check, 10000);
}

/**
 * Stop health check interval
 */
function stop() {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
    }
}

/**
 * Get current health status
 */
function getStatus() {
    return isHealthy;
}

module.exports = {
    start,
    stop,
    getStatus
};
