
exports.up = function(db, Promise) {
    return db.schema.hasTable('messages').then(function(exists) {
        if (!exists) {
            return db.schema.createTable('messages', table => {
                table.charset('utf8');
                table.collate('utf8_general_ci');
                table.increments('id').primary().unique().notNullable();
                table.string('address', [255]).notNullable();
                table.text('message').notNullable();
                table.text('source').notNullable();
                table.integer('timestamp');
                table.integer('alias_id').unsigned().references('id').inTable('capcodes');
                table.index(['address', 'id'], 'msg_index');
                table.index(['id', 'alias_id'], 'msg_alias');
                table.index(['timestamp', 'alias_id'], 'msg_timestamp');
            })
        } else {
          return Promise.resolve('Not Required')
        }
      })
}

exports.down = function(db, Promise) {
  return db.schema.dropTable('messages');
};




