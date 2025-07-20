import { createClient, RedisClientType, RedisClientOptions } from 'redis';
import dotenv from 'dotenv';
import { createPool, Pool } from 'generic-pool';

dotenv.config();

// Default connection config
const defaultConfig: RedisClientOptions = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries: number) => {
      // Exponential backoff with max delay of 5 seconds
      const delay = Math.min(retries * 50, 5000);
      console.log(`Redis reconnecting in ${delay}ms...`);
      return delay;
    },
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '5000', 10),
    keepAlive: 5000,
  },
  // Connection pool settings
  pingInterval: 10000, // Ping every 10 seconds to keep connections alive
  commandsQueueMaxLength: parseInt(process.env.REDIS_QUEUE_LENGTH || '5000', 10),
};

// Redis connection pool configuration
const POOL_CONFIG = {
  min: parseInt(process.env.REDIS_POOL_MIN || '2', 10),
  max: parseInt(process.env.REDIS_POOL_MAX || '10', 10),
  acquireTimeoutMillis: parseInt(process.env.REDIS_ACQUIRE_TIMEOUT || '10000', 10),
  idleTimeoutMillis: parseInt(process.env.REDIS_IDLE_TIMEOUT || '30000', 10),
  evictionRunIntervalMillis: parseInt(process.env.REDIS_EVICTION_INTERVAL || '15000', 10),
};

// Redis client pool
let redisPool: Pool<RedisClientType> | null = null;

// Legacy singleton client (for backward compatibility)
let redisClient: RedisClientType | null = null;
let isConnected = false;
let connectionPromise: Promise<RedisClientType> | null = null;

/**
 * Initialize the Redis connection pool
 */
function initializeRedisPool(): Pool<RedisClientType> {
  if (redisPool) {
    return redisPool;
  }

  console.log(`Initializing Redis connection pool (min: ${POOL_CONFIG.min}, max: ${POOL_CONFIG.max})`);
  
  // Create a connection pool
  redisPool = createPool({
    create: async () => {
      const client = createClient(defaultConfig);
      
      // Set up event handlers
      client.on('error', (err) => {
        console.error('Redis client error:', err);
      });
      
      client.on('connect', () => {
        console.debug('Redis client connected');
      });
      
      client.on('reconnecting', () => {
        console.debug('Redis client reconnecting');
      });
      
      client.on('end', () => {
        console.debug('Redis client connection closed');
      });
      
      // Connect to Redis
      await client.connect();
      return client;
    },
    destroy: async (client) => {
      try {
        await client.quit();
      } catch (error) {
        console.error('Error destroying Redis client:', error);
        client.disconnect();
      }
    },
    validate: (client) => {
      return client.isOpen;
    }
  }, POOL_CONFIG);
  
  // Log pool events
  redisPool.on('factoryCreateError', (err) => {
    console.error('Redis pool factory create error:', err);
  });
  
  redisPool.on('factoryDestroyError', (err) => {
    console.error('Redis pool factory destroy error:', err);
  });
  
  return redisPool;
}

/**
 * Get a Redis client from the pool
 */
export async function getRedisClient(): Promise<RedisClientType> {
  // For backward compatibility, if we already have a singleton client, return it
  if (redisClient && isConnected) {
    return redisClient;
  }
  
  // If we're in the process of connecting the singleton, wait for that to complete
  if (connectionPromise) {
    return connectionPromise;
  }
  
  // Initialize the pool if needed
  if (!redisPool) {
    initializeRedisPool();
  }
  
  // Get a client from the pool
  try {
    return await redisPool!.acquire();
  } catch (error) {
    console.error('Failed to acquire Redis client from pool:', error);
    
    // Fallback to singleton client if pool fails
    connectionPromise = (async () => {
      try {
        // Create new client if needed
        if (!redisClient || !isConnected) {
          redisClient = createClient(defaultConfig);
          
          // Handle connection events
          redisClient.on('error', (err) => {
            console.error('Redis client error:', err);
            isConnected = false;
          });
          
          redisClient.on('connect', () => {
            console.log('Redis client connected');
            isConnected = true;
          });
          
          await redisClient.connect();
          isConnected = true;
        }
        
        return redisClient;
      } catch (error) {
        console.error('Failed to connect to Redis:', error);
        isConnected = false;
        throw error;
      } finally {
        connectionPromise = null;
      }
    })();
    
    return connectionPromise;
  }
}

/**
 * Release a Redis client back to the pool
 */
export async function releaseRedisClient(client: RedisClientType): Promise<void> {
  // Don't release the singleton client
  if (client === redisClient) {
    return;
  }
  
  // Release the client back to the pool
  if (redisPool) {
    try {
      await redisPool.release(client);
    } catch (error) {
      console.error('Error releasing Redis client to pool:', error);
    }
  }
}

/**
 * Close the Redis client connection(s)
 */
export async function closeRedisClient(): Promise<void> {
  // Close the singleton client if it exists
  if (redisClient) {
    try {
      await redisClient.quit();
      redisClient = null;
      isConnected = false;
      console.log('Redis singleton client closed');
    } catch (error) {
      console.error('Error closing Redis singleton client:', error);
      if (redisClient) {
        redisClient.disconnect();
        redisClient = null;
        isConnected = false;
      }
    }
  }
  
  // Drain the pool if it exists
  if (redisPool) {
    try {
      await redisPool.drain();
      await redisPool.clear();
      redisPool = null;
      console.log('Redis connection pool closed');
    } catch (error) {
      console.error('Error closing Redis connection pool:', error);
    }
  }
}

/**
 * Set a value in Redis with optional expiration and retry logic
 */
export async function setCache<T>(
  key: string, 
  value: T, 
  expirationSeconds?: number,
  retries = 3
): Promise<void> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    let client: RedisClientType | null = null;
    
    try {
      client = await getRedisClient();
      const stringValue = JSON.stringify(value);
      
      if (expirationSeconds) {
        await client.set(key, stringValue, { EX: expirationSeconds });
      } else {
        await client.set(key, stringValue);
      }
      
      // Release client back to the pool
      if (client !== redisClient) {
        await releaseRedisClient(client);
      }
      
      return;
    } catch (error) {
      // Release client back to the pool even on error
      if (client && client !== redisClient) {
        await releaseRedisClient(client).catch(() => {});
      }
      
      lastError = error as Error;
      console.error(`Redis setCache attempt ${attempt} failed:`, error);
      
      if (attempt === retries) {
        throw new Error(`Redis setCache failed after ${retries} attempts: ${lastError?.message}`);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
}

/**
 * Get a value from Redis with retry logic
 */
export async function getCache<T>(
  key: string,
  retries = 3
): Promise<T | null> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    let client: RedisClientType | null = null;
    
    try {
      client = await getRedisClient();
      const value = await client.get(key);
      
      // Release client back to the pool
      if (client !== redisClient) {
        await releaseRedisClient(client);
      }
      
      if (!value) {
        return null;
      }
      
      try {
        return JSON.parse(value) as T;
      } catch (parseError) {
        console.error('Error parsing Redis value:', parseError);
        return null;
      }
    } catch (error) {
      // Release client back to the pool even on error
      if (client && client !== redisClient) {
        await releaseRedisClient(client).catch(() => {});
      }
      
      lastError = error as Error;
      console.error(`Redis getCache attempt ${attempt} failed:`, error);
      
      if (attempt === retries) {
        throw new Error(`Redis getCache failed after ${retries} attempts: ${lastError?.message}`);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
  
  return null;
}

/**
 * Delete a key from Redis with retry logic
 */
export async function deleteCache(
  key: string,
  retries = 3
): Promise<void> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    let client: RedisClientType | null = null;
    
    try {
      client = await getRedisClient();
      await client.del(key);
      
      // Release client back to the pool
      if (client !== redisClient) {
        await releaseRedisClient(client);
      }
      
      return;
    } catch (error) {
      // Release client back to the pool even on error
      if (client && client !== redisClient) {
        await releaseRedisClient(client).catch(() => {});
      }
      
      lastError = error as Error;
      console.error(`Redis deleteCache attempt ${attempt} failed:`, error);
      
      if (attempt === retries) {
        throw new Error(`Redis deleteCache failed after ${retries} attempts: ${lastError?.message}`);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
}

/**
 * Increment a counter in Redis with retry logic
 */
export async function incrementCounter(
  key: string, 
  increment = 1,
  retries = 3
): Promise<number> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    let client: RedisClientType | null = null;
    
    try {
      client = await getRedisClient();
      const result = await client.incrBy(key, increment);
      
      // Release client back to the pool
      if (client !== redisClient) {
        await releaseRedisClient(client);
      }
      
      return result;
    } catch (error) {
      // Release client back to the pool even on error
      if (client && client !== redisClient) {
        await releaseRedisClient(client).catch(() => {});
      }
      
      lastError = error as Error;
      console.error(`Redis incrementCounter attempt ${attempt} failed:`, error);
      
      if (attempt === retries) {
        throw new Error(`Redis incrementCounter failed after ${retries} attempts: ${lastError?.message}`);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
  
  return 0;
}

/**
 * Get multiple values from Redis with retry logic
 */
export async function getMultipleCache<T>(
  keys: string[],
  retries = 3
): Promise<Record<string, T | null>> {
  if (keys.length === 0) {
    return {};
  }
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    let client: RedisClientType | null = null;
    
    try {
      client = await getRedisClient();
      const values = await client.mGet(keys);
      
      // Release client back to the pool
      if (client !== redisClient) {
        await releaseRedisClient(client);
      }
      
      // Process results
      const result: Record<string, T | null> = {};
      
      keys.forEach((key, index) => {
        const value = values[index];
        
        if (!value) {
          result[key] = null;
          return;
        }
        
        try {
          result[key] = JSON.parse(value) as T;
        } catch (parseError) {
          console.error(`Error parsing Redis value for key ${key}:`, parseError);
          result[key] = null;
        }
      });
      
      return result;
    } catch (error) {
      // Release client back to the pool even on error
      if (client && client !== redisClient) {
        await releaseRedisClient(client).catch(() => {});
      }
      
      lastError = error as Error;
      console.error(`Redis getMultipleCache attempt ${attempt} failed:`, error);
      
      if (attempt === retries) {
        throw new Error(`Redis getMultipleCache failed after ${retries} attempts: ${lastError?.message}`);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
  
  return {};
}

/**
 * Find keys matching a pattern
 */
export async function findCacheKeys(
  pattern: string,
  retries = 3
): Promise<string[]> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    let client: RedisClientType | null = null;
    
    try {
      client = await getRedisClient();
      
      // Use SCAN for better performance with large datasets
      const keys: string[] = [];
      let cursor = 0;
      
      do {
        // Scan with cursor and pattern
        const result = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = result.cursor;
        keys.push(...result.keys);
      } while (cursor !== 0);
      
      // Release client back to the pool
      if (client !== redisClient) {
        await releaseRedisClient(client);
      }
      
      return keys;
    } catch (error) {
      // Release client back to the pool even on error
      if (client && client !== redisClient) {
        await releaseRedisClient(client).catch(() => {});
      }
      
      lastError = error as Error;
      console.error(`Redis findCacheKeys attempt ${attempt} failed:`, error);
      
      if (attempt === retries) {
        throw new Error(`Redis findCacheKeys failed after ${retries} attempts: ${lastError?.message}`);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
  
  return [];
}

/**
 * Get cache statistics for a key pattern
 */
export async function getCacheStats(
  pattern: string = '*'
): Promise<{ keysCount: number; memoryUsage: number }> {
  let client: RedisClientType | null = null;
  
  try {
    client = await getRedisClient();
    
    // Get key count
    const keys = await findCacheKeys(pattern);
    const keysCount = keys.length;
    
    // Get memory usage (INFO MEMORY command)
    const info = await client.info('memory');
    const usedMemoryMatch = info.match(/used_memory:(\d+)/);
    const memoryUsage = usedMemoryMatch ? parseInt(usedMemoryMatch[1], 10) : 0;
    
    // Release client back to the pool
    if (client !== redisClient) {
      await releaseRedisClient(client);
    }
    
    return { keysCount, memoryUsage };
  } catch (error) {
    // Release client back to the pool even on error
    if (client && client !== redisClient) {
      await releaseRedisClient(client).catch(() => {});
    }
    
    console.error('Error getting cache stats:', error);
    return { keysCount: 0, memoryUsage: 0 };
  }
}

/**
 * Check Redis health
 */
export async function checkRedisHealth(): Promise<boolean> {
  let client: RedisClientType | null = null;
  
  try {
    client = await getRedisClient();
    const pingResult = await client.ping();
    
    // Release client back to the pool
    if (client !== redisClient) {
      await releaseRedisClient(client);
    }
    
    return pingResult === 'PONG';
  } catch (error) {
    // Release client back to the pool even on error
    if (client && client !== redisClient) {
      await releaseRedisClient(client).catch(() => {});
    }
    
    console.error('Redis health check failed:', error);
    return false;
  }
}