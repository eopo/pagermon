/**
 * SDR Agent - spawns and manages RTL-FM and Multimon-NG processes
 */

const { spawn } = require('child_process');
const readline = require('readline');

const {
    INGEST__FREQUENCIES,
    INGEST__GAIN,
    INGEST__SQUELCH,
    INGEST__PPM,
    INGEST__PROTOCOLS,
    INGEST__CHARSET,
    INGEST__FORMAT,
    INGEST__DEVICE
} = require('./config');

let mmProc;
let rtlProc;

/**
 * Spawn rtl_fm process
 */
function spawnRTL() {
    const rtlArgs = ['-s', '22050'];

    if (!INGEST__FREQUENCIES) {
        console.error('INGEST__FREQUENCIES not specified');
        process.exit(1);
    }
    
    const freqList = INGEST__FREQUENCIES.split(',').map(s => s.trim()).filter(Boolean);

    if (freqList.length > 1 && !INGEST__SQUELCH) {
        console.error('Multiple frequencies require INGEST__SQUELCH');
        process.exit(1);
    }

    freqList.forEach(f => {
        rtlArgs.push('-f', String(f));
    });

    if (INGEST__GAIN) rtlArgs.push('-g', String(INGEST__GAIN));
    if (INGEST__PPM) rtlArgs.push('-p', String(INGEST__PPM));
    if (INGEST__SQUELCH) rtlArgs.push('-l', String(INGEST__SQUELCH));
    if (INGEST__DEVICE) rtlArgs.push('-d', String(INGEST__DEVICE));
    
    rtlArgs.push('-E', 'dc');
    rtlArgs.push('-F', '0');
    rtlArgs.push('-A', 'fast');
    
    console.log('[AGENT] Spawning rtl_fm', rtlArgs.join(' '));
    rtlProc = spawn('rtl_fm', rtlArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    
    rtlProc.on('error', (err) => {
        console.error('[AGENT] rtl_fm error:', err.message);
        process.exit(1);
    });
    
    rtlProc.on('exit', (code, signal) => {
        console.error(`[AGENT] rtl_fm exited with code=${code} signal=${signal}`);
        const exitCode = (typeof code === 'number') ? code : (signal ? 1 : 0);
        process.exit(exitCode);
    });

    try {
        if (rtlProc.stderr) {
            const rtlErrRl = readline.createInterface({ input: rtlProc.stderr });
            rtlErrRl.on('line', (line) => {
                console.log('[AGENT] rtl_fm stderr:', line);
                if (line.indexOf('status:') !== -1) {
                    const status = /status: (\d)/.exec(line);
                    process.exit(status ? parseInt(status[1], 10) : 1);
                }
            });
        }
    } catch (e) {
        console.warn('[AGENT] Could not set up stderr listener:', e.message);
    }

    return rtlProc;
}

/**
 * Spawn multimon-ng process
 */
function spawnMultimon() {
    const mmArgs = ['-t', 'raw'];

    if (!INGEST__PROTOCOLS) {
        console.error('INGEST__PROTOCOLS not specified');
        process.exit(1);
    }

    const demodList = INGEST__PROTOCOLS.split(',').map(s => s.trim()).filter(Boolean);
    demodList.forEach(d => {
        mmArgs.unshift('-a', d);
    });

    if (INGEST__CHARSET) mmArgs.push('-C', INGEST__CHARSET);
    if (INGEST__FORMAT) mmArgs.push('-f', INGEST__FORMAT);

    mmArgs.push('--timestamp');
    mmArgs.push('--iso8601');
    mmArgs.push('--json');
    mmArgs.push('-');

    console.log('[AGENT] Spawning multimon-ng', mmArgs.join(' '));
    mmProc = spawn('multimon-ng', mmArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
    
    mmProc.on('error', (err) => {
        console.error('[AGENT] multimon-ng error:', err.message);
        process.exit(1);
    });
    
    mmProc.on('exit', (code, signal) => {
        console.error(`[AGENT] multimon-ng exited with code=${code} signal=${signal}`);
        const exitCode = (typeof code === 'number') ? code : (signal ? 1 : 0);
        process.exit(exitCode);
    });

    try {
        if (mmProc.stderr) {
            const mmErrRl = readline.createInterface({ input: mmProc.stderr });
            mmErrRl.on('line', (line) => {
                console.log('[AGENT] multimon-ng stderr:', line);
                if (line.indexOf('status:') !== -1) {
                    const status = /status: (\d)/.exec(line);
                    process.exit(status ? parseInt(status[1], 10) : 1);
                }
            });
        }
    } catch (e) {
        console.warn('[AGENT] Could not set up stderr listener:', e.message);
    }

    return mmProc;
}

/**
 * Create pipe: rtl_fm stdout -> multimon-ng stdin
 */
function createPipe() {
    if (rtlProc.stdout && mmProc.stdin) {
        rtlProc.stdout.pipe(mmProc.stdin);
        console.log('[AGENT] Piped rtl_fm stdout to multimon-ng stdin');
    }
}

/**
 * Get stdout stream from multimon-ng
 */
function getOutputStream() {
    return mmProc.stdout;
}

/**
 * Kill RTL-FM and Multimon-NG processes
 */
function killProcesses() {
    try {
        if (mmProc && typeof mmProc.kill === 'function') mmProc.kill('SIGTERM');
    } catch (e) {
        console.error('[AGENT] Error killing multimon:', e.message);
    }
    try {
        if (rtlProc && typeof rtlProc.kill === 'function') rtlProc.kill('SIGTERM');
    } catch (e) {
        console.error('[AGENT] Error killing rtl_fm:', e.message);
    }
}

module.exports = {
    spawnRTL,
    spawnMultimon,
    createPipe,
    getOutputStream,
    killProcesses
};
