/**
 * Parse JSON lines from multimon-ng into PagerMon message payloads.
 */

const { normalizeFormat, normalizeMessage, validateMessage } = require('./model');

function asText(value) {
  return typeof value === 'string' ? value : '';
}

function parsePocsag(obj) {
  const alpha = asText(obj.alpha);
  const numeric = asText(obj.numeric);

  const format = alpha.length > 0 ? 'alpha' : 'numeric';
  const message = format === 'alpha' ? alpha : numeric;

  return {
    address: obj.address.toString() + obj.function.toString(),
    format,
    message,
    time: obj.timestamp,
    timestamp: Math.floor(new Date(obj.timestamp).getTime() / 1000),
    function: obj.function,
  };
}

function parseFlex(obj) {
  return {
    address: obj.capcode,
    format: normalizeFormat(obj.format || obj.type || obj.message_type),
    message: asText(obj.message),
    time: obj.timestamp,
    timestamp: Math.floor(new Date(obj.timestamp).getTime() / 1000),
  };
}

function parseLine(line, label) {
  if (!line || line.trim().length === 0) return null;

  try {
    const obj = JSON.parse(line);
    console.debug('[AGENT] Protocol:', obj.demod_name);

    let msg;
    if (obj.demod_name.indexOf('POCSAG') !== -1) {
      msg = parsePocsag(obj);
    } else if (obj.demod_name.indexOf('FLEX') !== -1) {
      msg = parseFlex(obj);
    } else {
      console.warn('[AGENT] Unknown protocol:', obj.demod_name);
      return null;
    }

    msg = normalizeMessage(msg);
    const validation = validateMessage(msg);
    if (!validation.valid) return null;

    msg.source = label;
    return msg;
  } catch (err) {
    return null;
  }
}

module.exports = {
  parseLine,
};
