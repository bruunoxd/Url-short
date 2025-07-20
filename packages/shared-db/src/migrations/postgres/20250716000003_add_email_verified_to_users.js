/**
 * Add email_verified column to users table
 */
exports.up = async function(knex) {
  return knex.schema.table('users', function(table) {
    table.boolean('email_verified').notNullable().defaultTo(false);
  });
};

/**
 * Remove email_verified column from users table
 */
exports.down = async function(knex) {
  return knex.schema.table('users', function(table) {
    table.dropColumn('email_verified');
  });
};