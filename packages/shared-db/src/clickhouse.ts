import { createClient, ClickHouseClient, ClickHouseClientConfigOptions } from '@clickhouse/client';
import dotenv from 'dotenv';

dotenv.config();

// Default connection config
const defaultConfig: ClickHouseClientConfigOptions = {
  host: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'clickhouse',
  password: process.env.CLICKHOUSE_PASSWORD || 'clickhouse',
  database: process.env.CLICKHOUSE_DB || 'analytics',
  compression: {
    request: true,
    response: true,
  },
  request_timeout: parseInt(process.env.CLICKHOUSE_TIMEOUT || '30000', 10),
  max_open_connections: parseInt(process.env.CLICKHOUSE_MAX_CONNECTIONS || '10', 10),
  keep_alive: {
    enabled: true,
    idle_socket_ttl: 60000, // 1 minute
  },
  application: 'url-shortener-analytics',
  log: {
    level: process.env.NODE_ENV === 'production' ? 'error' : 'info',
  },
};

// ClickHouse client singleton
let clickhouseClient: ClickHouseClient | null = null;
let isConnected = false;

/**
 * Get or create the ClickHouse client
 */
export function getClickHouseClient(): ClickHouseClient {
  if (!clickhouseClient) {
    clickhouseClient = createClient(defaultConfig);
    console.log('ClickHouse client created with max connections:', defaultConfig.max_open_connections);
  }
  
  return clickhouseClient;
}

/**
 * Check if ClickHouse is connected
 */
export async function checkClickHouseConnection(): Promise<boolean> {
  try {
    const client = getClickHouseClient();
    const result = await client.ping();
    isConnected = result.success;
    return isConnected;
  } catch (error) {
    console.error('ClickHouse connection check failed:', error);
    isConnected = false;
    return false;
  }
}

/**
 * Execute a ClickHouse query with retries
 */
export async function executeClickHouseQuery<T>(
  query: string, 
  params: Record<string, any> = {},
  retries = 3
): Promise<T[]> {
  const client = getClickHouseClient();
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await client.query({
        query,
        format: 'JSONEachRow',
        query_params: params,
      });
      
      return await result.json<T[]>();
    } catch (error) {
      lastError = error as Error;
      console.error(`ClickHouse query attempt ${attempt} failed:`, error);
      
      // Check connection on error
      await checkClickHouseConnection();
      
      if (attempt === retries) {
        throw new Error(`ClickHouse query failed after ${retries} attempts: ${lastError?.message}`);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
  
  throw new Error('ClickHouse query failed with unknown error');
}

/**
 * Insert data into ClickHouse with retries
 */
export async function insertClickHouseData<T>(
  table: string, 
  data: T | T[],
  retries = 3
): Promise<void> {
  const client = getClickHouseClient();
  const dataArray = Array.isArray(data) ? data : [data];
  
  if (dataArray.length === 0) {
    return;
  }
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await client.insert({
        table,
        values: dataArray,
        format: 'JSONEachRow',
      });
      return;
    } catch (error) {
      lastError = error as Error;
      console.error(`ClickHouse insert attempt ${attempt} failed:`, error);
      
      // Check connection on error
      await checkClickHouseConnection();
      
      if (attempt === retries) {
        throw new Error(`ClickHouse insert failed after ${retries} attempts: ${lastError?.message}`);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
  
  throw new Error('ClickHouse insert failed with unknown error');
}

/**
 * Insert data in batches for better performance
 */
export async function batchInsertClickHouseData<T>(
  table: string, 
  data: T[], 
  batchSize = 1000
): Promise<void> {
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    await insertClickHouseData(table, batch);
  }
}

/**
 * Check database health
 */
export async function checkClickHouseHealth(): Promise<boolean> {
  try {
    const connected = await checkClickHouseConnection();
    if (!connected) {
      return false;
    }
    
    // Try a simple query to verify database is working
    await executeClickHouseQuery('SELECT 1');
    return true;
  } catch (error) {
    console.error('ClickHouse health check failed:', error);
    return false;
  }
}

/**
 * Close the ClickHouse client
 */
export async function closeClickHouseClient(): Promise<void> {
  if (clickhouseClient) {
    await clickhouseClient.close();
    clickhouseClient = null;
    isConnected = false;
    console.log('ClickHouse client closed');
  }
}