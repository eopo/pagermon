#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');

const { Queue, Job } = require('bullmq');
const IORedis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';

const AGENT__FREQUENCIES = process.env.AGENT__FREQUENCIES;
const AGENT__GAIN = process.env.AGENT__GAIN || null;
const AGENT__SQUELCH = process.env.AGENT__SQUELCH || null;
const AGENT__PPM = process.env.AGENT__PPM || null;

const AGENT__PROTOCOLS = process.env.AGENT__PROTOCOLS || null;
const AGENT__CHARSET = process.env.AGENT__CHARSET || null;
const AGENT__FORMAT = process.env.AGENT__FORMAT || 'alpha';

const AGENT__LABEL = process.env.AGENT__LABEL || 'sdr-agent';

console.log('Starting SDR agent');

const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: 5 });
const queue = new Queue('sdr-messages', { connection: redis , defaultJobOptions: {
    attempts: 10,
    backoff: {
        type: 'exponential',
        delay: 1000,
    },
}});

queue.on('completed', (job) => {
    queue.getFailed().then((failed) => {
        for (const f of failed) {

            Job.fromId(queue, f.id, f.data)?.retry();
        }
    }).catch((err) => {
    });
});

let mmProc;
let rtlProc;

function spawnRTL() {
    const rtlArgs = ['-s', '22050'];

    if (!AGENT__FREQUENCIES) {
        console.error('AGENT__FREQUENCIES not specified in environment');
        process.exit(1);
    }
    
    const freqList = AGENT__FREQUENCIES.split(',').map(s => s.trim()).filter(Boolean);

    if (freqList.length > 1 && !AGENT__SQUELCH) {
        console.error('When specifying multiple frequencies, AGENT__SQUELCH must also be specified');
        process.exit(1);
    }

    freqList.forEach(f => {
        rtlArgs.push('-f', String(f));
    });

    if (AGENT__GAIN) rtlArgs.push('-g', String(AGENT__GAIN));
    if (AGENT__PPM) rtlArgs.push('-p', String(AGENT__PPM));
    if (AGENT__SQUELCH) {
        rtlArgs.push('-l', String(AGENT__SQUELCH));
    }
    rtlArgs.push('-E', 'dc');
    rtlArgs.push('-F', '0');
    rtlArgs.push('-A', 'fast');
    
    console.log('Spawning rtl_fm', rtlArgs.join(' '));
    rtlProc = spawn('rtl_fm', rtlArgs, { stdio: ['ignore', 'pipe', 'inherit'] });
    rtlProc.on('error', (err) => {
        console.error('rtl_fm error', err);
        // attempt an orderly shutdown and exit with non-zero code
        shutdown(1);
    });
    rtlProc.on('exit', (code, signal) => {
        console.error(`rtl_fm exited with code=${code} signal=${signal}`);
        // Controlled crash on device loss. If the child exited due to a signal,
        // 'code' will be null and 'signal' will be a string (e.g. 'SIGTERM').
        // Normalize to a numeric exit code: use the numeric code if present,
        // otherwise use 1 to indicate failure.
        const exitCode = (typeof code === 'number') ? code : (signal ? 1 : 0);
        // Call shutdown with a numeric code (shutdown will call process.exit)
        shutdown(exitCode);
    });

    // return the spawned process so callers can keep a reference
    return rtlProc;

}

function spawnMultimon() {
    const mmArgs = ['-t', 'raw'];

    if (!AGENT__PROTOCOLS) {
        console.error('AGENT__PROTOCOLS not specified in environment');
        process.exit(1);
    }

    const demodList = AGENT__PROTOCOLS.split(',').map(s => s.trim()).filter(Boolean);
    demodList.forEach(d => {
        mmArgs.unshift('-a', d);
    });

    if (AGENT__CHARSET) mmArgs.push('-C', AGENT__CHARSET);
    if (AGENT__FORMAT) mmArgs.push('-f', AGENT__FORMAT);

    mmArgs.push('--timestamp');
    mmArgs.push('--iso8601');
    mmArgs.push('--json');
    mmArgs.push('-')

    console.log('Spawning multimon-ng', mmArgs.join(' '));
    mmProc = spawn('multimon-ng', mmArgs, { stdio: ['pipe', 'pipe', 'inherit'] });
    mmProc.on('error', (err) => {
        console.error('multimon-ng error', err);
        shutdown(1);
    });
    mmProc.on('exit', (code, signal) => {
        console.error(`multimon-ng exited with code=${code} signal=${signal}`);
        const exitCode = (typeof code === 'number') ? code : (signal ? 1 : 0);
        shutdown(exitCode);
    });
    return mmProc;
}

function createPipe() {
    if (rtlProc.stdout && mmProc.stdin) {
        rtlProc.stdout.pipe(mmProc.stdin);
    }
}

function shutdown(code = 0) {
    console.log('Shutting down');
    Promise.resolve()
        .then(() => queue.close().catch((err) => { console.error('Error closing queue', err); }))
        .then(() => redis.quit().catch((err) => { console.error('Error quitting redis', err); }))
        .then(() => {
            try {
                if (mmProc && typeof mmProc.kill === 'function') mmProc.kill('SIGTERM');
            } catch (e) { console.error('Error killing multimon process', e); }
            try {
                if (rtlProc && typeof rtlProc.kill === 'function') rtlProc.kill('SIGTERM');
            } catch (e) { console.error('Error killing rtl process', e); }
        })
        .then(() => {
            console.log('Shutdown complete');
            process.exit(code);
        })
        .catch((err) => {
            console.error('Error during shutdown', err);
            process.exit(1);
        });
}


function handleLine(line) {
    if (!line || line.trim().length === 0) return;
    
    try {
            const obj = JSON.parse(line);
            console.debug('Protocol: ', obj.demod_name);

            let msg;
            if (obj.demod_name.indexOf('POCSAG') !== -1) {
                msg =  handlePocsag(obj);
            } else if (obj.demod_name.indexOf('FLEX') !== -1) {
                msg = handleFlex(obj);
            } else {
                console.warn('Unknown protocol:', obj.demod_name);
                return null;
            }

            msg.source = AGENT__LABEL;

            queue.add('message', msg, { removeOnComplete: true, removeOnFail: false })
            .then((job) => {
                console.log('Received message:', msg)
                console.log('Enqueued job:', job.id);
            })
            .catch((err) => {
                console.error('Failed to enqueue job', err, msg);
            });

        } catch (err) {
            console.log(line);
            if (line.indexOf('status:') !== -1) {
                const status = /status: (\d)/.exec(line);
                shutdown(status ? parseInt(status[1], 10) : 1);
            }
        }

}

const handlePocsag = (obj) => ({
        address: obj.address.toString() + obj.function.toString(), // I absolute hate it, but I need it for now.
        message: obj.alpha || obj.numeric || '',
        time: obj.timestamp,
        timestamp: Math.floor(new Date(obj.timestamp).getTime()/1000),
        function: obj.function,
    })

const handleFlex = (obj) => ({
        address: obj.capcode,
        message: obj.message || '',
        time: obj.timestamp,
        timestamp: Math.floor(new Date(obj.timestamp).getTime()/1000),
})

function main() {
    rtlProc = spawnRTL();
    mmProc = spawnMultimon();
    createPipe();

    const rl = readline.createInterface({ input: mmProc.stdout });

    rl.on('line', async (line) => {
        handleLine(line);
    });

    rl.on('close', () => {
        console.error('multimon-ng stdout closed');
        shutdown(1);
    });

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGQUIT', shutdown);
}


main();