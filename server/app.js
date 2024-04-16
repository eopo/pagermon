const version = '0.4.0-beta';

const debug = require('debug')('pagermon:server');
const pm2io = require('@pm2/io').init({
        http: true, // HTTP routes logging (default: true)
        ignore_routes: [/socket\.io/, /notFound/], // Ignore http routes with this pattern (Default: [])
        errors: true, // Exceptions logging (default: true)
        custom_probes: true, // Auto expose JS Loop Latency and HTTP req/s as custom metrics
        network: true, // Network monitoring at the application level
        ports: true, // Shows which ports your app is listening on (default: false)
        transactions: true,
});
const http = require('http');
const compression = require('compression');
const express = require('express');
const path = require('path');
const favicon = require('serve-favicon');
const logger = require('./log');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const fs = require('fs');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const flash = require('connect-flash');
const confDefaults = require('./config/default.json');

// create config file if it does not exist, and set defaults

const confFile = './config/config.json';
if (!fs.existsSync(confFile)) {
        fs.writeFileSync(confFile, JSON.stringify(confDefaults, null, 2));
}
// load the config file
const nconf = require('nconf');

nconf.file({ file: confFile });
nconf.load();

// Load current theme
let theme = nconf.get('global:theme');
// set the theme if none found, for backwards compatibility
if (!theme) {
        nconf.set('global:theme', 'default');
        nconf.save();
        theme = nconf.get('global:theme');
}

const dbtype = nconf.get('database:type');
// Set the database port if none found, for backwards compatibility
if (dbtype === 'pg' || dbtype === 'mysql' || dbtype === 'mssql') {
        if (!nconf.get('database:port')) {
                nconf.set('database:port', 3306);
                nconf.save();
        }
}

// Enable Azure Monitoring if enabled
const azureEnable = nconf.get('monitoring:azureEnable');
const azureKey = nconf.get('monitoring:azureKey');
if (azureEnable) {
        logger.main.debug('Starting Azure Application Insights');
        // eslint-disable-next-line global-require
        const appInsights = require('applicationinsights');
        appInsights
                .setup(azureKey)
                .setAutoDependencyCorrelation(true)
                .setAutoCollectRequests(true)
                .setAutoCollectPerformance(true)
                .setAutoCollectExceptions(true)
                .setAutoCollectDependencies(true)
                .setAutoCollectConsole(true)
                .setUseDiskRetryCaching(true)
                .start();
}

checkForDbDriver(nconf.get('database:type'));

require('./db').init();
const db = require('./knex/knex.js');

const passport = require('./auth/local');

// routes
const index = require('./routes/index');
const admin = require('./routes/admin');
const api = require('./routes/api');
const auth = require('./routes/auth');

const port = normalizePort(process.env.PORT || '3000');
const app = express();
app.set('port', port);
// view engine setup
app.set('views', path.join(__dirname, 'themes', theme, 'views'));
app.set('view engine', 'ejs');
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

const server = http.createServer(app);
const io = require('socket.io')(server);

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);
// Set connection timeout to prevent long running queries failing on large databases - mostly capacode refresh on MySQL
server.on('connection', function(connection) {
        connection.setTimeout(600 * 1000);
});
// Lets set setMaxListeners to a decent number - not to high to allow the memory leak warking to still trigger
io.sockets.setMaxListeners(20);
io.sockets.on('connection', function(socket) {
        socket.removeAllListeners();
        debug('client connect to normal socket');
        //    socket.on('echo', function (data) {
        //        io.sockets.emit('message', data);
        //        console.log('message', data);
        //    });
});
// Admin Socket
const adminio = io.of('/adminio');
adminio.on('connection', function(socket) {
        socket.removeAllListeners();
        debug('client connect to admin socket');
        //    adminio.on('echo', function (data) {
        //        adminio.emit('message', data);
        //        console.log('message', data);
        //    });
});

app.use(favicon(path.join(__dirname, 'themes', theme, 'public', 'favicon.ico')));

// set socket.io to be shared across all modules
app.use(function(req, res, next) {
        req.io = io;
        next();
});

// session secret is controlled by config
const sessionSecret = nconf.get('global:sessionSecret');
// compress all responses
app.use(compression());
app.use(require('morgan')('combined', { stream: logger.http.stream }));

app.use(
        bodyParser.json({
                limit: '1mb',
        })
); // to support JSON-encoded bodies
app.use(
        bodyParser.urlencoded({
                extended: true,
                limit: '1mb',
        })
); // to support URL-encoded bodies
app.use(cookieParser());

const sessionSettings = {
        cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 1 week
        store: new SQLiteStore(),
        saveUninitialized: true,
        resave: 'true',
        secret: sessionSecret,
};

if (process.env.HOSTNAME && process.env.USE_COOKIE_HOST) sessionSettings.cookie.domain = `.${process.env.HOSTNAME}`;

app.use(session(sessionSettings));
app.use(passport.initialize());
app.use(passport.session()); // persistent login sessions
app.use(flash());
app.use(express.static(path.join(__dirname, 'themes', theme, 'public')));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));
app.use(function(req, res, next) {
        res.locals.version = version;
        res.locals.loglevel = nconf.get('global:loglevel') || 'info';
        next();
});

app.use('/', index);
app.use('/admin', admin);
app.use('/post', api);
app.use('/api', api);
app.use('/auth', auth);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
        const err = new Error('Not Found');
        err.status = 404;
        next(err);
});

// error handler
app.use(function(err, req, res, next) {
        var title = nconf.get('global:monitorName') || 'PagerMon';
        // set locals, only providing error in development
        res.locals.message = err.message;
        res.locals.error = req.app.get('env') === 'development' ? err : {};
        // these 3 have to be here to stop the error handler shitting up the logs with undefined references when it receives a 500 error ... nfi why
        res.locals.login = req.isAuthenticated();
        res.locals.gaEnable = nconf.get('monitoring:gaEnable');
        res.locals.monitorName = nconf.get('global:monitorName');
        res.locals.register = nconf.get('auth:registration');

        // render the error page
        res.status(err.status || 500);
        res.render(path.join(__dirname, 'themes', theme, 'views', 'global', 'error'), { title });
});

// Add cronjob to automatically refresh aliases
if (dbtype === 'mysql') {
        /* eslint-disable global-require */
        const cronValidator = require('cron-validator');
        const cron = require('cron');
        /* eslint-enable global-require */

        // Check, if the cron value is there and valid, else set defautl
        if (
                !(
                        nconf.get('database:aliasRefreshInterval') &&
                        cronValidator.isValidCron(nconf.get('database:aliasRefreshInterval'), { seconds: true })
                )
        ) {
                logger.main.warn('CRON: Invalid CRON configuration in config file. Defaulting to: "0 5,35 * * * *" ');
                nconf.set('database:cronAliasRefreshInterval', '0 5,35 * * * *');
        }

        // Get CRON from config
        const cronAliasRefreshInterval = nconf.get('database:aliasRefreshInterval');

        cron.CronJob.from({
                cronTime: cronAliasRefreshInterval,
                onTick: async () => {
                        if (!nconf.get('database:aliasRefreshRequired') === 1) {
                                return logger.main.debug('CRON: Alias Refresh not Required, Skipping.');
                        }
                        try {
                                console.time('updateMap');
                                logger.main.info('CRON: Alias Refresh required, running.');
                                await db('messages').update('alias_id', function() {
                                        this.select('id')
                                                .from('capcodes')
                                                .where(db.ref('messages.address'), 'like', db.ref('capcodes.address'))
                                                .orderByRaw("REPLACE(address, '_', '%') DESC LIMIT 1");
                                });
                                console.timeEnd('updateMap');
                                nconf.set('database:aliasRefreshRequired', 0);
                                nconf.save();
                                logger.main.info('CRON: Alias Refresh Successful');
                        } catch (error) {
                                logger.main.error(`CRON: Error refreshing aliases${error}`);
                                console.timeEnd('updateMap');
                        }
                },
                start: true,
        });
}

// Disable all logging for tests
if (process.env.NODE_ENV === 'test') {
        logger.main.silent = true;
        logger.auth.silent = true;
        logger.db.silent = true;
        logger.http.silent = true;
}

module.exports = app;

function normalizePort(val) {
        const parsedPort = parseInt(val, 10);

        if (Number.isNaN(parsedPort)) {
                // named pipe
                return val;
        }

        if (parsedPort >= 0) {
                // port number
                return parsedPort;
        }

        return false;
}

function onError(error) {
        if (error.syscall !== 'listen') throw error;

        const bind = typeof port === 'string' ? `Pipe ${port}` : `Port ${port}`;

        // handle specific listen errors with friendly messages
        switch (error.code) {
                /* eslint-disable no-fallthrough */
                case 'EACCES':
                        console.error(`${bind} requires elevated privileges`);
                        process.exit(1);
                case 'EADDRINUSE':
                        process.exit(1);
                default:
                /* eslint-enable no-fallthrough */
        }
}

function checkForDbDriver(driver) {
        switch (driver) {
                /* eslint-disable import/no-unresolved, import/no-extraneous-dependencies, global-require */
                case 'sqlite3': {
                        try {
                                require('sqlite3');
                        } catch (e) {
                                logger.main.error(
                                        `Selected database type is sqlite3, but npm package sqlite3 was not installed.`
                                );
                                logger.main.error(
                                        `Please run npm i sqlite3 to install or refer to https://www.npmjs.com/package/sqlite3 for reference`
                                );
                                process.exit(1);
                        }
                        break;
                }
                case 'mysql': {
                        try {
                                require('knex');
                        } catch (e) {
                                logger.main.error(
                                        `Selected database type is mysql, but npm package knex was not installed.`
                                );
                                logger.main.error(
                                        `Please run npm i knex to install or refer to https://www.npmjs.com/package/knex for reference`
                                );
                                process.exit(1);
                        }
                        break;
                }
                case 'oracledb': {
                        try {
                                require('oracledb');
                        } catch (e) {
                                logger.main.error(
                                        `Selected database type is oracledb, but npm package oracledb was not installed.`
                                );
                                logger.main.error(
                                        `Please run npm i oracledb to install or refer to https://www.npmjs.com/package/oracledb for reference`
                                );
                                process.exit(1);
                        }
                        break;
                }
                default: {
                        logger.main.error(`No database type was specified.`);
                        process.exit(1);
                }
        }
        /* eslint-enable import/no-unresolved, import/no-extraneous-dependencies, global-require */
}

function onListening() {
        const addr = server.address();
        const bind = typeof addr === 'string' ? `pipe ${addr}` : `port ${addr.port}`;
        logger.main.info(`Listening on ${bind}`);
}

process.on('SIGINT', function() {
        console.log('\nGracefully shutting down from SIGINT (Ctrl-C)');
        process.exit(1);
});
