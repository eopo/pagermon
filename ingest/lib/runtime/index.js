/**
 * Runtime module - exports all runtime components
 *
 * This module groups together the components that manage the
 * runtime lifecycle of the ingest service:
 * - agent: SDR process management (RTL-FM, Multimon-NG)
 * - queue: BullMQ message queue
 * - worker: Queue consumer that POSTs to API
 * - health: API availability monitoring with recovery
 */

const agent = require('./agent');
const queue = require('./queue');
const worker = require('./worker');
const health = require('./health');

module.exports = {
  agent,
  queue,
  worker,
  health,
};
