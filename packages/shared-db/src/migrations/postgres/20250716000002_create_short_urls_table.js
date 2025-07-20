/**
 * PostgreSQL migration: create_short_urls_table
 */
exports.up = async function(pool) {
  await pool.query(`
    -- Short URLs table
    CREATE TABLE IF NOT EXISTS short_urls (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      original_url TEXT NOT NULL,
      short_code VARCHAR(10) UNIQUE NOT NULL,
      title VARCHAR(255),
      tags TEXT[] DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      expires_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_short_urls_code ON short_urls(short_code);
    CREATE INDEX IF NOT EXISTS idx_short_urls_user_id ON short_urls(user_id);
    CREATE INDEX IF NOT EXISTS idx_short_urls_created_at ON short_urls(created_at);

    -- Trigger to automatically update updated_at
    CREATE TRIGGER update_short_urls_updated_at BEFORE UPDATE ON short_urls
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = async function(pool) {
  await pool.query(`
    -- Drop trigger
    DROP TRIGGER IF EXISTS update_short_urls_updated_at ON short_urls;
    
    -- Drop table
    DROP TABLE IF EXISTS short_urls;
  `);
};