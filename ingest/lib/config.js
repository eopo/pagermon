/**
 * Configuration loading and validation
 */

const INGEST__REDIS_URL = process.env.INGEST__REDIS_URL || 'redis://redis:6379';

// SDR Ingest Configuration
const INGEST__FREQUENCIES = process.env.INGEST__FREQUENCIES;
const INGEST__GAIN = process.env.INGEST__GAIN || null;
const INGEST__SQUELCH = process.env.INGEST__SQUELCH || null;
const INGEST__PPM = process.env.INGEST__PPM || null;
const INGEST__PROTOCOLS = process.env.INGEST__PROTOCOLS;
const INGEST__CHARSET = process.env.INGEST__CHARSET || null;
const INGEST__FORMAT = process.env.INGEST__FORMAT || 'alpha';
const INGEST__DEVICE = process.env.INGEST__DEVICE || null;
const INGEST__LABEL = process.env.INGEST__LABEL || 'sdr-ingest';

// PagerMon API Configuration
const INGEST__API_URL = process.env.INGEST__API_URL || 'http://pagermon:3000';
const INGEST__API_KEY = process.env.INGEST__API_KEY;

// Optional: Dead Letter Queue
const INGEST__ENABLE_DLQ = process.env.INGEST__ENABLE_DLQ !== 'false';

// Circuit Breaker config
const INGEST__CIRCUIT_BREAKER_THRESHOLD = parseInt(process.env.INGEST__CIRCUIT_BREAKER_THRESHOLD || '5', 10);
const INGEST__CIRCUIT_BREAKER_TIMEOUT = parseInt(process.env.INGEST__CIRCUIT_BREAKER_TIMEOUT || '30000', 10);

/**
 * Validate configuration and throw on errors
 */
function validate() {
    const errors = [];
    if (!INGEST__FREQUENCIES) errors.push('INGEST__FREQUENCIES not specified');
    if (!INGEST__PROTOCOLS) errors.push('INGEST__PROTOCOLS not specified');
    if (!INGEST__API_KEY) errors.push('INGEST__API_KEY not specified');

    if (errors.length > 0) {
        console.error('Configuration errors:');
        errors.forEach(e => console.error(`  - ${e}`));
        process.exit(1);
    }
}

module.exports = {
    INGEST__REDIS_URL,
    INGEST__FREQUENCIES,
    INGEST__GAIN,
    INGEST__SQUELCH,
    INGEST__PPM,
    INGEST__PROTOCOLS,
    INGEST__CHARSET,
    INGEST__FORMAT,
    INGEST__DEVICE,
    INGEST__LABEL,
    INGEST__API_URL,
    INGEST__API_KEY,
    INGEST__ENABLE_DLQ,
    INGEST__CIRCUIT_BREAKER_THRESHOLD,
    INGEST__CIRCUIT_BREAKER_TIMEOUT,
    validate
};
