#!/usr/bin/env node

/**
 * Pagermon Ingest Service - Main entry point
 *
 * Combines RTL-FM, Multimon-NG, and BullMQ in a single process
 */

const readline = require('readline');

const version = require('./package.json').version;
const config = require('./lib/config');
const { agent, queue: queueModule, worker, health } = require('./lib/runtime');
const { parseLine } = require('./lib/message');

/**
 * Main initialization
 */
async function main() {
  // Validate config
  config.validate();

  console.log(`${'='.repeat(50)}`);
  console.log(`Pagermon Ingest Service v${version}`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Label:              ${config.INGEST__LABEL}`);
  console.log(`API URL:            ${config.INGEST__API_URL}`);
  console.log(`Redis URL:          ${config.INGEST__REDIS_URL}`);
  console.log(`Dead Letter Queue:  ${config.INGEST__ENABLE_DLQ ? 'enabled' : 'disabled'}`);
  console.log(`${'='.repeat(50)}`);

  // Initialize services
  queueModule.create();
  worker.create();
  health.start();

  // Spawn SDR processes
  agent.spawnRTL();
  agent.spawnMultimon();
  agent.createPipe();

  // Setup message reading
  const outputStream = agent.getOutputStream();
  const rl = readline.createInterface({ input: outputStream });

  rl.on('line', async (line) => {
    try {
      const msg = parseLine(line, config.INGEST__LABEL);
      if (msg) {
        await queueModule.addMessage(msg);
      }
    } catch (err) {
      console.error('[MAIN] Failed to enqueue parsed message:', err.message);
    }
  });

  rl.on('close', () => {
    console.error('[AGENT] Output stream closed');
    shutdown(1);
  });

  rl.on('error', (err) => {
    console.error('[AGENT] Stream error:', err.message);
    shutdown(1);
  });

  // Signal handlers
  process.on('SIGINT', () => {
    console.log('[MAIN] Received SIGINT');
    shutdown(0);
  });

  process.on('SIGTERM', () => {
    console.log('[MAIN] Received SIGTERM');
    shutdown(0);
  });

  process.on('SIGQUIT', () => {
    console.log('[MAIN] Received SIGQUIT');
    shutdown(0);
  });

  console.log('[MAIN] Service started');
}

/**
 * Graceful shutdown
 */
async function shutdown(code = 0) {
  console.log('[MAIN] Initiating shutdown...');

  try {
    health.stop();
    await worker.close();
    await queueModule.close();
    agent.killProcesses();

    console.log('[MAIN] Shutdown complete');
    process.exit(code);
  } catch (err) {
    console.error('[MAIN] Error during shutdown:', err.message);
    process.exit(1);
  }
}

main();
