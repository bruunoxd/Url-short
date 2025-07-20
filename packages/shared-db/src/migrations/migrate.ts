import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { getPostgresPool, executeQuery } from '../postgres';
import { getClickHouseClient } from '../clickhouse';

// Migration table name
const MIGRATION_TABLE = 'migrations';

/**
 * Ensure the migrations table exists
 */
async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations(pool: Pool): Promise<string[]> {
  const result = await pool.query(`
    SELECT name FROM ${MIGRATION_TABLE} ORDER BY id ASC;
  `);
  return result.rows.map(row => row.name);
}

/**
 * Get list of migration files
 */
function getMigrationFiles(migrationType: string): string[] {
  const migrationsDir = path.join(__dirname, migrationType);
  
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }
  
  return fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.js') || file.endsWith('.ts'))
    .sort();
}

/**
 * Apply PostgreSQL migrations
 */
async function applyPostgresMigrations(): Promise<void> {
  const pool = getPostgresPool();
  
  try {
    // Ensure migrations table exists
    await ensureMigrationsTable(pool);
    
    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations(pool);
    
    // Get migration files
    const migrationFiles = getMigrationFiles('postgres');
    
    // Apply pending migrations
    for (const file of migrationFiles) {
      if (!appliedMigrations.includes(file)) {
        console.log(`Applying PostgreSQL migration: ${file}`);
        
        // Import and execute migration
        const migration = require(path.join(__dirname, 'postgres', file));
        await migration.up(pool);
        
        // Record migration
        await pool.query(`
          INSERT INTO ${MIGRATION_TABLE} (name) VALUES ($1);
        `, [file]);
        
        console.log(`Migration ${file} applied successfully`);
      }
    }
    
    console.log('PostgreSQL migrations completed');
  } catch (error) {
    console.error('Error applying PostgreSQL migrations:', error);
    throw error;
  }
}

/**
 * Apply ClickHouse migrations
 */
async function applyClickHouseMigrations(): Promise<void> {
  const client = getClickHouseClient();
  
  try {
    // Get migration files
    const migrationFiles = getMigrationFiles('clickhouse');
    
    // Apply migrations
    for (const file of migrationFiles) {
      console.log(`Applying ClickHouse migration: ${file}`);
      
      // Import and execute migration
      const migration = require(path.join(__dirname, 'clickhouse', file));
      await migration.up(client);
      
      console.log(`Migration ${file} applied successfully`);
    }
    
    console.log('ClickHouse migrations completed');
  } catch (error) {
    console.error('Error applying ClickHouse migrations:', error);
    throw error;
  }
}

/**
 * Rollback PostgreSQL migrations
 */
async function rollbackPostgresMigrations(): Promise<void> {
  const pool = getPostgresPool();
  
  try {
    // Ensure migrations table exists
    await ensureMigrationsTable(pool);
    
    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations(pool);
    
    if (appliedMigrations.length === 0) {
      console.log('No migrations to rollback');
      return;
    }
    
    // Get last applied migration
    const lastMigration = appliedMigrations[appliedMigrations.length - 1];
    
    // Import and execute down migration
    console.log(`Rolling back PostgreSQL migration: ${lastMigration}`);
    const migration = require(path.join(__dirname, 'postgres', lastMigration));
    await migration.down(pool);
    
    // Remove migration record
    await pool.query(`
      DELETE FROM ${MIGRATION_TABLE} WHERE name = $1;
    `, [lastMigration]);
    
    console.log(`Migration ${lastMigration} rolled back successfully`);
  } catch (error) {
    console.error('Error rolling back PostgreSQL migrations:', error);
    throw error;
  }
}

/**
 * Run migrations
 */
async function runMigrations(command: string): Promise<void> {
  try {
    if (command === 'up') {
      await applyPostgresMigrations();
      await applyClickHouseMigrations();
      console.log('All migrations completed successfully');
    } else if (command === 'down') {
      await rollbackPostgresMigrations();
      console.log('Rollback completed successfully');
    } else {
      console.error('Invalid command. Use "up" or "down"');
      process.exit(1);
    }
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

// Run migrations if called directly
if (require.main === module) {
  const command = process.argv[2] || 'up';
  runMigrations(command)
    .finally(() => {
      process.exit(0);
    });
}

export { runMigrations };