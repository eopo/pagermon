/**
 * Message normalization and validation helpers.
 */

function normalizeFormat(input) {
  const format = `${input || ''}`.trim().toLowerCase();
  if (['alpha', 'alphanumeric', 'aln', 'text'].includes(format)) return 'alpha';
  if (['numeric', 'num', 'gpn'].includes(format)) return 'numeric';
  return 'alpha';
}

function normalizeMessage(message) {
  const normalized = { ...message };
  normalized.format = normalizeFormat(normalized.format || normalized.messageFormat);

  if (typeof normalized.message !== 'string') {
    normalized.message = '';
  }

  return normalized;
}

function validateMessage(message, options = {}) {
  const { requireAddress = true } = options;

  if (requireAddress && !message.address) {
    return { valid: false, reason: 'missing address' };
  }

  if (message.format === 'alpha' && message.message.trim().length === 0) {
    return { valid: false, reason: 'missing alpha message payload' };
  }

  return { valid: true };
}

module.exports = {
  normalizeFormat,
  normalizeMessage,
  validateMessage,
};
