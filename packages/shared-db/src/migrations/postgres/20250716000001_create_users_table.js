/**
 * PostgreSQL migration: create_users_table
 */
exports.up = async function(pool) {
  await pool.query(`
    -- Enable UUID extension
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      is_active BOOLEAN DEFAULT true
    );

    -- Create index for email lookups
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    -- Function to update updated_at timestamp
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql';

    -- Trigger to automatically update updated_at
    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = async function(pool) {
  await pool.query(`
    -- Drop trigger
    DROP TRIGGER IF EXISTS update_users_updated_at ON users;
    
    -- Drop function (only if not used by other tables)
    -- DROP FUNCTION IF EXISTS update_updated_at_column();
    
    -- Drop table
    DROP TABLE IF EXISTS users;
  `);
};