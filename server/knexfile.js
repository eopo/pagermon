const nconf = require('nconf');
const logger = require('./log');

const loglevel = nconf.get('global:loglevel');

const debugOn = loglevel === 'debug';

const dbtype = nconf.get('database:type');

// in order to create migration files, client must be hardcoded to 'sqlite3' otherwise it won't work.
const dbconfig = {
        client: dbtype,
        connection: {},
        useNullAsDefault: true,
        debug: debugOn,
        migrations: {
                tableName: 'knex_migrations',
                directory: `${__dirname}/knex/migrations`,
        },
        seeds: {
                directory: `${__dirname}/knex/seeds`,
        },
        log: {
                warn(message) {
                        logger.db.info(JSON.stringify(message));
                },
                error(message) {
                        logger.db.error(JSON.stringify(message));
                },
                deprecate(message) {
                        logger.db.info(JSON.stringify(message));
                },
                debug(message) {
                        logger.db.debug(JSON.stringify(message));
                },
        },
};

if (process.env.NODE_ENV === 'test') {
        dbconfig.connection = getTestConnection();
} else {
        switch (dbtype) {
                case 'sqlite3':
                        dbconfig.connection = getSqliteConnection();
                        break;
                case 'mysql':
                        dbconfig.connection = getMySQLConnection();
                        break;
                case 'oracledb':
                        dbconfig.connection = getOracleConnection();
                        dbconfig.fetchAsString = ['clob'];
                        break;
                default:
                        process.exit('No valid db setting');
        }
}

function getTestConnection() {
        return {
                filename: './test/messages.db',
        };
}
function getSqliteConnection() {
        return {
                filename: nconf.get('database:file'),
        };
}
function getMySQLConnection() {
        return {
                host: nconf.get('database:server'),
                port: nconf.get('database:port'),
                user: nconf.get('database:username'),
                password: nconf.get('database:password'),
                database: nconf.get('database:database'),
        };
}
function getOracleConnection() {
        return {
                connectString: nconf.get('database:connectString'),
                user: nconf.get('database:username'),
                password: nconf.get('database:password'),
        };
}

// this is required because of the silly way knex migrations handle environments
module.exports = Object.assign({}, dbconfig, {
        test: dbconfig,
        development: dbconfig,
        staging: dbconfig,
        production: dbconfig,
});
