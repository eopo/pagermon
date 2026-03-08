/**
 * Message parsing for different protocols
 */

const handlePocsag = (obj) => ({
    address: obj.address.toString() + obj.function.toString(),
    message: obj.alpha || obj.numeric || '',
    time: obj.timestamp,
    timestamp: Math.floor(new Date(obj.timestamp).getTime() / 1000),
    function: obj.function,
});

const handleFlex = (obj) => ({
    address: obj.capcode,
    message: obj.message || '',
    time: obj.timestamp,
    timestamp: Math.floor(new Date(obj.timestamp).getTime() / 1000),
});

/**
 * Parse a line of JSON output from multimon-ng
 * @param {string} line - Raw JSON line from multimon-ng
 * @returns {object|null} Parsed message or null if unable to parse
 */
function parseLine(line, label) {
    if (!line || line.trim().length === 0) return null;
    
    try {
        const obj = JSON.parse(line);
        console.debug('[AGENT] Protocol:', obj.demod_name);

        let msg;
        if (obj.demod_name.indexOf('POCSAG') !== -1) {
            msg = handlePocsag(obj);
        } else if (obj.demod_name.indexOf('FLEX') !== -1) {
            msg = handleFlex(obj);
        } else {
            console.warn('[AGENT] Unknown protocol:', obj.demod_name);
            return null;
        }

        msg.source = label;
        return msg;
    } catch (err) {
        return null;
    }
}

module.exports = {
    parseLine
};
