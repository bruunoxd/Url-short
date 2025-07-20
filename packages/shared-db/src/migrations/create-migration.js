const fs = require('fs');
const path = require('path');

// Get migration name from command line
const migrationName = process.argv[2];
if (!migrationName) {
  console.error('Please provide a migration name');
  process.exit(1);
}

// Create timestamp for migration file
const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);
const fileName = `${timestamp}_${migrationName}.js`;

// Create PostgreSQL migration
const pgMigrationDir = path.join(__dirname, 'postgres');
if (!fs.existsSync(pgMigrationDir)) {
  fs.mkdirSync(pgMigrationDir, { recursive: true });
}

const pgMigrationContent = `/**
 * PostgreSQL migration: ${migrationName}
 */
exports.up = async function(pool) {
  await pool.query(\`
    -- Your SQL migration code here
  \`);
};

exports.down = async function(pool) {
  await pool.query(\`
    -- Your SQL rollback code here
  \`);
};
`;

fs.writeFileSync(path.join(pgMigrationDir, fileName), pgMigrationContent);
console.log(`Created PostgreSQL migration: ${fileName}`);

// Create ClickHouse migration
const chMigrationDir = path.join(__dirname, 'clickhouse');
if (!fs.existsSync(chMigrationDir)) {
  fs.mkdirSync(chMigrationDir, { recursive: true });
}

const chMigrationContent = `/**
 * ClickHouse migration: ${migrationName}
 */
exports.up = async function(client) {
  await client.query({
    query: \`
      -- Your ClickHouse migration code here
    \`,
    format: 'JSONEachRow'
  });
};
`;

fs.writeFileSync(path.join(chMigrationDir, fileName), chMigrationContent);
console.log(`Created ClickHouse migration: ${fileName}`);