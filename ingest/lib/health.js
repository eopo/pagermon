/**
 * Health check logic for API availability monitoring
 */

const { INGEST__API_URL } = require('./config');
const circuitBreaker = require('./circuitBreaker');
const queue = require('./queue');

let isHealthy = false;
let healthCheckInterval;

/**
 * Perform a health check against the PagerMon API
 */
async function check() {
    try {
        const response = await fetch(`${INGEST__API_URL}/health`, {
            method: 'GET',
            timeout: 5000,
            signal: AbortSignal.timeout(5000)
        });
        
        const healthy = response.ok;
        circuitBreaker.updateState(healthy);
        
        if (healthy !== isHealthy) {
            isHealthy = healthy;
            console.log(`[HEALTH] API is ${healthy ? 'UP' : 'DOWN'}`);
            
            if (healthy && circuitBreaker.getState().state === 'CLOSED') {
                await processFailedJobs();
            }
        }
        
        return healthy;
    } catch (error) {
        circuitBreaker.updateState(false);
        
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
    check,
    start,
    stop,
    getStatus
};
