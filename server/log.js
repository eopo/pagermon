const winston = require('winston');

const { format } = winston;
// const { combine, label, json, cli } = format;
// load the config file
var nconf = require('nconf');

var confFile = './config/config.json';
nconf.file({ file: confFile });
nconf.load();

const loglevel = nconf.get('global:loglevel');

function configureLogger(label) {
        const logger = {
                format: format.combine(
                        format.colorize(),
                        format.label({ label: `[${label}]` }),
                        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                        format.prettyPrint(),
                        format.splat(),
                        format.printf(info => `${info.label}  ${info.timestamp}  ${info.level}: ${info.message}`)
                ),
                transports: [
                        new winston.transports.File({
                                level: loglevel,
                                filename: `./logs/${label}.log`,
                                handleExceptions: true,
                                maxsize: 10485760,
                                maxFiles: 5,
                        }),
                        new winston.transports.Console({
                                level: loglevel,
                                handleExceptions: true,
                        }),
                ],
        };
        return { label, logger };
}

winston.loggers.add(configureLogger('pagermon'));
winston.loggers.add(configureLogger('http'));
winston.loggers.add(configureLogger('db'));
winston.loggers.add(configureLogger('auth'));

module.exports = {
        main: winston.loggers.get('pagermon'),
        http: winston.loggers.get('http'),
        db: winston.loggers.get('db'),
        auth: winston.loggers.get('auth'),
};

module.exports.http.stream = {
        write(message, encoding) {
                var httpLog = winston.loggers.get('http');
                httpLog.debug(message.substring(0, message.lastIndexOf('\n')));
        },
};
