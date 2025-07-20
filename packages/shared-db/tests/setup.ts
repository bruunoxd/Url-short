import { newDb } from 'pg-mem';
import { Pool } from 'pg';

// Mock PostgreSQL
const mockPg = {
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    }),
    query: jest.fn().mockResolvedValue({ rows: [] }),
    end: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  })),
};

// Mock Redis
const mockRedis = {
  createClient: jest.fn().mockReturnValue({
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    incrBy: jest.fn().mockResolvedValue(1),
  }),
};

// Mock ClickHouse
const mockClickHouse = {
  createClient: jest.fn().mockReturnValue({
    query: jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue([]),
    }),
    insert: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue({ success: true }),
    close: jest.fn(),
  }),
};

// Setup mocks
jest.mock('pg', () => mockPg);
jest.mock('redis', () => mockRedis);
jest.mock('@clickhouse/client', () => mockClickHouse);

// Create in-memory PostgreSQL database for testing
export function createTestDb() {
  const db = newDb();
  
  // Add UUID extension
  db.public.registerFunction({
    name: 'uuid_generate_v4',
    returns: 'uuid',
    implementation: () => '00000000-0000-0000-0000-000000000000',
  });
  
  // Create users table
  db.public.query(`
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      is_active BOOLEAN DEFAULT true
    );
  `);
  
  // Create short_urls table
  db.public.query(`
    CREATE TABLE short_urls (
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
  `);
  
  // Create mock pool
  const pool = db.adapters.createPg().Pool();
  
  return { db, pool };
}

// Reset mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});