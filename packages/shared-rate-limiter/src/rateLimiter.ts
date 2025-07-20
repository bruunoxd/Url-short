import { getRedisClient, releaseRedisClient } from '@url-shortener/shared-db';
import { RateLimitInfo } from './types';

/**
 * Redis-based distributed rate limiter
 */
export class RateLimiter {
  /**
   * Check if a request exceeds the rate limit
   * 
   * @param key - Unique identifier for the rate limit (e.g., IP address, user ID)
   * @param limit - Maximum number of requests allowed in the time window
   * @param windowSizeInSeconds - Time window in seconds
   * @returns Rate limit information
   */
  public static async check(
    key: string,
    limit: number,
    windowSizeInSeconds: number
  ): Promise<RateLimitInfo> {
    const redisKey = `rate_limit:${key}`;
    const now = Date.now();
    const windowSizeMs = windowSizeInSeconds * 1000;
    
    const client = await getRedisClient();
    
    try {
      // Get current rate limit info from Redis
      const currentData = await client.get(redisKey);
      let rateLimitInfo: RateLimitInfo;
      
      if (!currentData) {
        // First request in this window
        rateLimitInfo = {
          count: 1,
          resetTime: now + windowSizeMs,
          windowSizeInSeconds,
          limit
        };
        
        // Store in Redis with expiration
        await client.set(redisKey, JSON.stringify(rateLimitInfo), {
          EX: windowSizeInSeconds
        });
      } else {
        // Parse existing data
        const existingData = JSON.parse(currentData) as RateLimitInfo;
        
        // Check if the window has expired
        if (now > existingData.resetTime) {
          // Start a new window
          rateLimitInfo = {
            count: 1,
            resetTime: now + windowSizeMs,
            windowSizeInSeconds,
            limit
          };
        } else {
          // Increment the counter in the current window
          rateLimitInfo = {
            ...existingData,
            count: existingData.count + 1
          };
        }
        
        // Update Redis
        await client.set(redisKey, JSON.stringify(rateLimitInfo), {
          EX: windowSizeInSeconds
        });
      }
      
      return rateLimitInfo;
    } finally {
      // Always release the Redis client back to the pool
      await releaseRedisClient(client);
    }
  }
  
  /**
   * Reset rate limit for a key
   * 
   * @param key - Unique identifier for the rate limit
   */
  public static async reset(key: string): Promise<void> {
    const redisKey = `rate_limit:${key}`;
    const client = await getRedisClient();
    
    try {
      await client.del(redisKey);
    } finally {
      await releaseRedisClient(client);
    }
  }
  
  /**
   * Get current rate limit information without incrementing
   * 
   * @param key - Unique identifier for the rate limit
   */
  public static async get(key: string): Promise<RateLimitInfo | null> {
    const redisKey = `rate_limit:${key}`;
    const client = await getRedisClient();
    
    try {
      const data = await client.get(redisKey);
      
      if (!data) {
        return null;
      }
      
      return JSON.parse(data) as RateLimitInfo;
    } finally {
      await releaseRedisClient(client);
    }
  }
}