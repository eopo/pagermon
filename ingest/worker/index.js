const version = require('../../package.json').version;

const {Worker} = require('bullmq');
const IORedis = require('ioredis');


const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';

const WORKER__API_URL = process.env.WORKER__API_URL || 'http://pagermon:3000';
const WORKER__API_KEY = process.env.WORKER__API_KEY;

if (!WORKER__API_KEY) {
    console.error('WORKER__API_KEY not specified in environment');
    process.exit(1);
}

console.log('Starting SDR worker, connecting to', REDIS_URL);

const connection = new IORedis(REDIS_URL);

const worker = new Worker('sdr-messages', async job => {
    const message = job.data;

    console.log('Processing message:', message);

    try {
        const response = await fetch(`${WORKER__API_URL}/api/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': WORKER__API_KEY,
                'User-Agent': `pagermon-ingest-worker/${version}`
            },
            body: JSON.stringify(message)
        });

        if (!response.ok) {
            throw new Error(`Failed to send message to PagerMon: ${response.statusText}`);
        }

        console.log('Message sent to PagerMon successfully');
    } catch (error) {
        console.error('Error sending message to PagerMon:', error);
        throw error;
    }
}, {connection});

worker.on('completed', job => {
    console.log(`Job ${job.id} has completed`);
});

worker.on('failed', (job, err) => {
    console.error(`Job ${job.id} has failed with error: ${err.message}`);
});

process.on('SIGTERM', async () => {
    console.log('Shutting down worker');
    await worker.close();
    connection.disconnect();
    process.exit(0);
});