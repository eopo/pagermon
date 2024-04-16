const logger = require('./log');
const nconf = require('nconf');
const db = require('./knex/knex.js');

const confFile = './config/config.json';
nconf.file({ file: confFile });
nconf.load();

// initialize the database if it does not already exist
async function init() {
        const dbtype = nconf.get('database:type');
        if (dbtype == null || dbtype === 'sqlite') setDefaultConfig(); // This does stop the process and requires a re-run TODO: Can we reload the config instead?
        if (dbtype === 'sqlite3') updateSqlite();
        if (process.env.NODE_ENV !== 'test') runMigrations();
}

function setDefaultConfig() {
        nconf.set('database:type', 'sqlite3');
        nconf.set('database:file', './messages.db');
        nconf.save();
        logger.main.error('Error reading database type. Defaulting to SQLITE3. Killing application');
        process.exit(1);
}

async function updateSqlite() {
        // Legacy Database handling - force an upgrade and or remove the old version numbers
        const res = await db.raw(`pragma user_version;`);

        // Check if database is currently v0.2.3 if not force upgrade to that first
        if (res[0].user_version < 20181118 && res[0].user_version !== 0) {
                logger.main.info(`Current Legacy DB version: ${res[0].user_version}`);
                logger.main.error(
                        'Unsupported Upgrade Version - Upgrade Pagermon Database to v0.2.3 BEFORE upgrading to v0.3.0'
                );
                process.exit(1);
        } else if (res[0].user_version >= 20181118) {
                // If the database has a legacy version number from 0.3.0 - remove it
                logger.main.info(`Current Legacy DB version: ${res[0].user_version}`);
                try {
                        await db.raw('pragma user_version = 0;');
                        logger.main.debug('Removing legacy DB version infomation');
                } catch (error) {
                        logger.main.error(`Error removing legacy DB version infomation ${error}`);
                }
        }
}

async function runMigrations() {
        const currentVersion = await db.migrate
                .currentVersion()
                .catch(err => logger.main.error(`Error retrieving database version: ${err}`));
        logger.main.info(`Current DB version: ${currentVersion}`);

        const migration = await db.migrate.latest().catch(err => logger.main.error(`Error upgrading database: ${err}`));
        if (migration[0] === 1) {
                logger.main.info('Database upgrades complete');
        } else if (migration[0] === 2) {
                logger.main.info('Database upgrade not required');
        }
}

module.exports = {
        init,
};
