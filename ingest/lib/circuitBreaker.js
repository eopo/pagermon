/**
 * Circuit breaker pattern implementation
 * Prevents cascading failures when the API is unavailable
 */

const { INGEST__CIRCUIT_BREAKER_THRESHOLD, INGEST__CIRCUIT_BREAKER_TIMEOUT } = require('./config');

const circuitBreaker = {
    state: 'CLOSED',
    failureCount: 0,
    successCount: 0,
    lastFailureTime: null
};

/**
 * Update circuit breaker state based on success/failure
 */
function updateState(success) {
    if (success) {
        circuitBreaker.successCount++;
        circuitBreaker.failureCount = 0;
        
        if (circuitBreaker.state === 'HALF_OPEN' && circuitBreaker.successCount >= 3) {
            circuitBreaker.state = 'CLOSED';
            console.log('[CIRCUIT_BREAKER] State: CLOSED');
        }
    } else {
        circuitBreaker.failureCount++;
        circuitBreaker.lastFailureTime = Date.now();
        
        if (circuitBreaker.state === 'CLOSED' && circuitBreaker.failureCount >= INGEST__CIRCUIT_BREAKER_THRESHOLD) {
            circuitBreaker.state = 'OPEN';
            console.warn('[CIRCUIT_BREAKER] State: OPEN - Too many failures');
        }
    }
}

/**
 * Check if the circuit breaker is open (blocking requests)
 */
function isOpen() {
    if (circuitBreaker.state === 'CLOSED') return false;
    
    if (circuitBreaker.state === 'OPEN') {
        const timeSinceLastFailure = Date.now() - circuitBreaker.lastFailureTime;
        if (timeSinceLastFailure > INGEST__CIRCUIT_BREAKER_TIMEOUT) {
            circuitBreaker.state = 'HALF_OPEN';
            circuitBreaker.successCount = 0;
            console.log('[CIRCUIT_BREAKER] State: HALF_OPEN - Attempting recovery');
            return false;
        }
        return true;
    }
    
    return false;
}

/**
 * Get current state for debugging
 */
function getState() {
    return {
        state: circuitBreaker.state,
        failureCount: circuitBreaker.failureCount,
        successCount: circuitBreaker.successCount
    };
}

module.exports = {
    updateState,
    isOpen,
    getState
}