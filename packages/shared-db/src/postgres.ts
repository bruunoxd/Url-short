import { Pool, PoolClient, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Default connection config
const defaultConfig: PoolConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'url_shortener',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  // Connection pool settings
  max: parseInt(process.env.POSTGRES_POOL_SIZE || '20', 10),
  idleTimeoutMillis: parseInt(process.env.POSTGRES_IDLE_TIMEOUT || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.POSTGRES_CONNECT_TIMEOUT || '2000', 10),
  // Connection health check
  allowExitOnIdle: false,
  // SSL configuration if needed
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
};

// Create a singleton pool instance
let pool: Pool;

/**
 * Get or create the PostgreSQL connection pool
 */
export function getPostgresPool(): Pool {
  if (!pool) {
    pool = new Pool(defaultConfig);
    
    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });
    
    // Handle connection events
    pool.on('connect', (client) => {
      console.debug('New PostgreSQL client connected');
    });
    
    pool.on('acquire', (client) => {
      console.debug('PostgreSQL client acquired from pool');
    });
    
    pool.on('remove', (client) => {
      console.debug('PostgreSQL client removed from pool');
    });
    
    console.log('PostgreSQL connection pool created with max size:', defaultConfig.max);
  }
  
  return pool;
}

/**
 * Execute a query with automatic client release
 */
export async function executeQuery<T>(
  query: string, 
  params: any[] = [],
  retries = 3
): Promise<T[]> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    const client = await getPostgresPool().connect();
    try {
      const result = await client.query(query, params);
      return result.rows as T[];
    } catch (error) {
      lastError = error as Error;
      
      // Only retry on connection errors, not query errors
      if (error instanceof Error && 
          !error.message.includes('connection') && 
          !error.message.includes('timeout')) {
        throw error;
      }
      
      console.error(`Query attempt ${attempt} failed:`, error);
      
      if (attempt === retries) {
        throw new Error(`Query failed after ${retries} attempts: ${lastError?.message}`);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    } finally {
      client.release();
    }
  }
  
  throw new Error('Query failed with unknown error');
}

/**
 * Execute a transaction with multiple queries
 */
export async function executeTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
  retries = 3
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    const client = await getPostgresPool().connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      lastError = error as Error;
      
      // Only retry on connection errors, not query errors
      if (error instanceof Error && 
          !error.message.includes('connection') && 
          !error.message.includes('timeout')) {
        throw error;
      }
      
      console.error(`Transaction attempt ${attempt} failed:`, error);
      
      if (attempt === retries) {
        throw new Error(`Transaction failed after ${retries} attempts: ${lastError?.message}`);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    } finally {
      client.release();
    }
  }
  
  throw new Error('Transaction failed with unknown error');
}

/**
 * Get pool statistics
 */
export function getPoolStats(): {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
} {
  const poolStats = getPostgresPool() as any;
  return {
    totalCount: poolStats.totalCount,
    idleCount: poolStats.idleCount,
    waitingCount: poolStats.waitingCount,
  };
}

/**
 * Check database connection health
 */
export async function checkPostgresHealth(): Promise<boolean> {
  try {
    await executeQuery('SELECT 1');
    return true;
  } catch (error) {
    console.error('PostgreSQL health check failed:', error);
    return false;
  }
}

/**
 * Close the PostgreSQL connection pool
 */
export async function closePostgresPool(): Promise<void> {
  if (pool) {
    await pool.end();
    console.log('PostgreSQL connection pool closed');
    pool = undefined as any;
  }
}