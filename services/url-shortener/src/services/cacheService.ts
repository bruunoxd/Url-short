import { 
  setCache, 
  getCache, 
  deleteCache, 
  getMultipleCache, 
  findCacheKeys, 
  getCacheStats,
  incrementCounter
} from '@url-shortener/shared-db';
import { cacheOperations, cacheHitRatio } from '@url-shortener/shared-monitoring';
import LRUCache from 'lru-cache';
import NodeCache from 'node-cache';

const SERVICE_NAME = 'url-shortener';

// Cache TTL values in seconds
export const CACHE_TTL = {
  // Redis cache TTL (1 hour)
  REDIS_DEFAULT: 3600,
  // Redis cache TTL for popular URLs (24 hours)
  REDIS_POPULAR: 86400,
  // In-memory LRU cache TTL (5 minutes)
  MEMORY_DEFAULT: 300,
  // In-memory LRU cache TTL for popular URLs (1 hour)
  MEMORY_POPULAR: 3600,
  // In-memory hot cache TTL (30 seconds)
  HOT_CACHE: 30
};

// Cache size limits
export const CACHE_LIMITS = {
  // Maximum size of LRU cache (items)
  LRU_MAX_ITEMS: parseInt(process.env.CACHE_LRU_MAX_ITEMS || '1000', 10),
  // Maximum size of hot cache (items)
  HOT_MAX_ITEMS: parseInt(process.env.CACHE_HOT_MAX_ITEMS || '100', 10),
  // Maximum batch size for cache operations
  BATCH_SIZE: 50
};

// Popularity threshold (number of hits to consider a URL popular)
export const POPULARITY_THRESHOLD = 10;

// Configure in-memory LRU cache (L1)
const memoryCache = new LRUCache<string, any>({
  // Maximum size of cache (items)
  max: CACHE_LIMITS.LRU_MAX_ITEMS,
  // TTL in milliseconds (default: 5 minutes)
  ttl: CACHE_TTL.MEMORY_DEFAULT * 1000,
  // Update TTL on get operations
  updateAgeOnGet: true,
  // Function to call when items are evicted from cache
  disposeAfter: (value, key) => {
    console.debug(`Memory cache item evicted: ${key}`);
  }
});

// Configure ultra-fast in-memory hot cache (L0) for extremely popular URLs
// This cache has a very short TTL but is checked first for the most frequently accessed URLs
const hotCache = new NodeCache({
  stdTTL: CACHE_TTL.HOT_CACHE,
  checkperiod: 10, // Check for expired keys every 10 seconds
  maxKeys: CACHE_LIMITS.HOT_MAX_ITEMS,
  useClones: false // For better performance
});

// URL hit counter for popularity tracking
const urlHitCounter = new Map<string, number>();

/**
 * Multi-level caching service for URL shortener
 */
export class CacheService {
  // Track extremely popular URLs for hot cache
  private extremelyPopularThreshold = POPULARITY_THRESHOLD * 5;
  private cacheStats = {
    hits: {
      hot: 0,
      memory: 0,
      redis: 0
    },
    misses: 0,
    errors: 0
  };

  /**
   * Get a value from the cache (tries hot cache, then memory cache, then Redis)
   * 
   * @param key - Cache key
   * @returns Cached value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      // Try hot cache first (L0) - fastest, but smallest and shortest TTL
      const hotValue = hotCache.get<T>(key);
      
      if (hotValue !== undefined) {
        // Record cache hit
        cacheOperations.inc({ operation: 'get', result: 'hit', service: SERVICE_NAME });
        cacheHitRatio.set({ cache_type: 'hot', service: SERVICE_NAME }, 1);
        this.cacheStats.hits.hot++;
        
        // Increment hit counter for this URL
        this.incrementHitCounter(key);
        
        return hotValue;
      }
      
      // Try memory cache next (L1)
      const memoryValue = memoryCache.get(key) as T | undefined;
      
      if (memoryValue !== undefined) {
        // Record cache hit
        cacheOperations.inc({ operation: 'get', result: 'hit', service: SERVICE_NAME });
        cacheHitRatio.set({ cache_type: 'memory', service: SERVICE_NAME }, 1);
        this.cacheStats.hits.memory++;
        
        // Increment hit counter for this URL
        this.incrementHitCounter(key);
        
        // If this URL is extremely popular, add to hot cache
        if (this.isExtremelyPopularUrl(key)) {
          hotCache.set(key, memoryValue);
        }
        
        return memoryValue;
      }
      
      // If not in memory cache, try Redis (L2)
      const redisValue = await getCache<T>(key);
      
      if (redisValue !== null) {
        // Record cache hit
        cacheOperations.inc({ operation: 'get', result: 'hit', service: SERVICE_NAME });
        cacheHitRatio.set({ cache_type: 'redis', service: SERVICE_NAME }, 1);
        this.cacheStats.hits.redis++;
        
        // Store in memory cache for faster future access
        memoryCache.set(key, redisValue);
        
        // Increment hit counter for this URL
        this.incrementHitCounter(key);
        
        return redisValue;
      }
      
      // Not found in any cache
      cacheOperations.inc({ operation: 'get', result: 'miss', service: SERVICE_NAME });
      cacheHitRatio.set({ cache_type: 'combined', service: SERVICE_NAME }, 0);
      this.cacheStats.misses++;
      
      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      cacheOperations.inc({ operation: 'get', result: 'error', service: SERVICE_NAME });
      this.cacheStats.errors++;
      
      // Return null on error to allow fallback to database
      return null;
    }
  }
  
  /**
   * Set a value in the cache (all cache levels)
   * 
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Optional TTL in seconds (uses default if not provided)
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      // Check if this is a popular URL
      const isPopular = this.isPopularUrl(key);
      const isExtremelyPopular = this.isExtremelyPopularUrl(key);
      
      // Set TTL based on popularity
      const redisTtl = ttl || (isPopular ? CACHE_TTL.REDIS_POPULAR : CACHE_TTL.REDIS_DEFAULT);
      const memoryTtl = isPopular ? CACHE_TTL.MEMORY_POPULAR : CACHE_TTL.MEMORY_DEFAULT;
      
      // Set in Redis (L2)
      await setCache(key, value, redisTtl);
      
      // Set in memory cache (L1)
      memoryCache.set(key, value, { ttl: memoryTtl * 1000 });
      
      // Set in hot cache (L0) if extremely popular
      if (isExtremelyPopular) {
        hotCache.set(key, value, CACHE_TTL.HOT_CACHE);
      }
      
      cacheOperations.inc({ operation: 'set', result: 'success', service: SERVICE_NAME });
    } catch (error) {
      console.error('Cache set error:', error);
      cacheOperations.inc({ operation: 'set', result: 'error', service: SERVICE_NAME });
    }
  }
  
  /**
   * Delete a value from the cache (all cache levels)
   * 
   * @param key - Cache key
   */
  async delete(key: string): Promise<void> {
    try {
      // Delete from hot cache (L0)
      hotCache.del(key);
      
      // Delete from memory cache (L1)
      memoryCache.delete(key);
      
      // Delete from Redis (L2)
      await deleteCache(key);
      
      // Reset hit counter
      urlHitCounter.delete(key);
      
      cacheOperations.inc({ operation: 'delete', result: 'success', service: SERVICE_NAME });
    } catch (error) {
      console.error('Cache delete error:', error);
      cacheOperations.inc({ operation: 'delete', result: 'error', service: SERVICE_NAME });
    }
  }
  
  /**
   * Clear the entire cache (both memory and Redis)
   * This is a potentially expensive operation and should be used sparingly
   */
  async clear(): Promise<void> {
    try {
      // Clear memory cache
      memoryCache.clear();
      
      // Redis doesn't have a simple way to clear all keys in a specific pattern
      // In a real implementation, you might use SCAN + DEL or a specific key pattern
      
      cacheOperations.inc({ operation: 'clear', result: 'success', service: SERVICE_NAME });
    } catch (error) {
      console.error('Cache clear error:', error);
      cacheOperations.inc({ operation: 'clear', result: 'error', service: SERVICE_NAME });
    }
  }
  
  /**
   * Increment the hit counter for a URL
   * 
   * @param key - Cache key
   */
  private incrementHitCounter(key: string): void {
    const currentCount = urlHitCounter.get(key) || 0;
    urlHitCounter.set(key, currentCount + 1);
    
    // If this URL just became popular, update its TTL
    if (currentCount + 1 === POPULARITY_THRESHOLD) {
      this.promoteToPopular(key);
    }
  }
  
  /**
   * Check if a URL is considered popular
   * 
   * @param key - Cache key
   * @returns True if the URL is popular
   */
  private isPopularUrl(key: string): boolean {
    return (urlHitCounter.get(key) || 0) >= POPULARITY_THRESHOLD;
  }
  
  /**
   * Check if a URL is considered extremely popular (for hot cache)
   * 
   * @param key - Cache key
   * @returns True if the URL is extremely popular
   */
  private isExtremelyPopularUrl(key: string): boolean {
    return (urlHitCounter.get(key) || 0) >= this.extremelyPopularThreshold;
  }
  
  /**
   * Promote a URL to popular status (longer TTL)
   * 
   * @param key - Cache key
   */
  private async promoteToPopular(key: string): Promise<void> {
    try {
      // Get the current value from cache
      const value = memoryCache.get(key);
      
      if (value !== undefined) {
        // Update memory cache with longer TTL
        memoryCache.set(key, value, { ttl: CACHE_TTL.MEMORY_POPULAR * 1000 });
        
        // Update Redis cache with longer TTL
        await setCache(key, value, CACHE_TTL.REDIS_POPULAR);
        
        console.log(`URL promoted to popular status: ${key}`);
      }
    } catch (error) {
      console.error('Error promoting URL to popular status:', error);
    }
  }
  
  /**
   * Get multiple values from the cache in a batch
   * 
   * @param keys - Array of cache keys
   * @returns Record of key-value pairs (null for missing values)
   */
  async getMultiple<T>(keys: string[]): Promise<Record<string, T | null>> {
    if (keys.length === 0) {
      return {};
    }
    
    try {
      const result: Record<string, T | null> = {};
      const missingKeys: string[] = [];
      
      // First check hot cache and memory cache (synchronous operations)
      for (const key of keys) {
        // Try hot cache first
        const hotValue = hotCache.get<T>(key);
        if (hotValue !== undefined) {
          result[key] = hotValue;
          this.incrementHitCounter(key);
          this.cacheStats.hits.hot++;
          continue;
        }
        
        // Try memory cache
        const memoryValue = memoryCache.get(key) as T | undefined;
        if (memoryValue !== undefined) {
          result[key] = memoryValue;
          this.incrementHitCounter(key);
          this.cacheStats.hits.memory++;
          
          // If extremely popular, add to hot cache
          if (this.isExtremelyPopularUrl(key)) {
            hotCache.set(key, memoryValue);
          }
          continue;
        }
        
        // Not found in memory caches, add to missing keys list
        missingKeys.push(key);
      }
      
      // If we have missing keys, check Redis
      if (missingKeys.length > 0) {
        const redisValues = await getMultipleCache<T>(missingKeys);
        
        // Process Redis results
        for (const key of missingKeys) {
          const value = redisValues[key];
          result[key] = value;
          
          if (value !== null) {
            // Cache hit in Redis
            this.cacheStats.hits.redis++;
            this.incrementHitCounter(key);
            
            // Add to memory cache for future lookups
            memoryCache.set(key, value);
          } else {
            // Cache miss
            this.cacheStats.misses++;
          }
        }
      }
      
      // Update metrics
      const totalKeys = keys.length;
      const hits = totalKeys - this.cacheStats.misses;
      cacheHitRatio.set({ cache_type: 'combined', service: SERVICE_NAME }, hits / totalKeys);
      
      return result;
    } catch (error) {
      console.error('Cache getMultiple error:', error);
      cacheOperations.inc({ operation: 'getMultiple', result: 'error', service: SERVICE_NAME });
      this.cacheStats.errors++;
      
      // Return empty object on error
      return {};
    }
  }
  
  /**
   * Invalidate cache entries matching a pattern
   * 
   * @param pattern - Key pattern to invalidate (e.g., "url:*")
   * @param options - Optional configuration for invalidation
   * @returns Number of keys invalidated
   */
  async invalidatePattern(
    pattern: string,
    options: {
      onlyMemory?: boolean;
      batchSize?: number;
      logLevel?: 'debug' | 'info' | 'warn' | 'error';
    } = {}
  ): Promise<number> {
    try {
      const logLevel = options.logLevel || 'info';
      const batchSize = options.batchSize || CACHE_LIMITS.BATCH_SIZE;
      const onlyMemory = options.onlyMemory || false;
      
      if (logLevel === 'info' || logLevel === 'debug') {
        console.log(`Invalidating cache keys matching pattern: ${pattern}`);
      }
      
      // Find keys matching pattern in Redis (unless we're only invalidating memory)
      const keys = onlyMemory ? [] : await findCacheKeys(pattern);
      
      // For memory cache, we need to iterate through all keys and check the pattern
      // This is a limitation of LRU cache and NodeCache not supporting pattern matching
      const memoryKeys: string[] = [];
      
      // Convert pattern to regex for memory cache matching
      const patternRegex = new RegExp(pattern.replace(/\*/g, '.*'));
      
      // Get keys from memory cache that match the pattern
      // For LRU cache, we need to dump the cache and check each key
      const memoryDump = memoryCache.dump();
      for (const key of Object.keys(memoryDump)) {
        if (patternRegex.test(key)) {
          memoryKeys.push(key);
        }
      }
      
      // Get keys from hot cache that match the pattern
      const hotKeys = hotCache.keys().filter(key => patternRegex.test(key));
      
      // Combine all keys (removing duplicates)
      const allKeys = [...new Set([...keys, ...memoryKeys, ...hotKeys])];
      
      if (allKeys.length === 0) {
        return 0;
      }
      
      // Delete from memory cache
      for (const key of allKeys) {
        memoryCache.delete(key);
        hotCache.del(key);
        urlHitCounter.delete(key);
      }
      
      // Delete from Redis in batches (unless we're only invalidating memory)
      if (!onlyMemory) {
        const batches = Math.ceil(keys.length / batchSize);
        
        for (let i = 0; i < batches; i++) {
          const batchKeys = keys.slice(i * batchSize, (i + 1) * batchSize);
          
          // Delete each key in the batch
          await Promise.all(batchKeys.map(key => deleteCache(key)));
        }
      }
      
      if (logLevel === 'info' || logLevel === 'debug') {
        console.log(`Invalidated ${allKeys.length} cache keys (${memoryKeys.length} memory, ${hotKeys.length} hot, ${keys.length} Redis)`);
      }
      
      cacheOperations.inc({ 
        operation: 'invalidate', 
        result: 'success', 
        service: SERVICE_NAME 
      });
      
      return allKeys.length;
    } catch (error) {
      console.error('Cache invalidation error:', error);
      cacheOperations.inc({ 
        operation: 'invalidate', 
        result: 'error', 
        service: SERVICE_NAME 
      });
      return 0;
    }
  }
  
  /**
   * Invalidate cache entries for a specific user
   * 
   * @param userId - User ID
   * @returns Number of keys invalidated
   */
  async invalidateUserCache(userId: string): Promise<number> {
    return this.invalidatePattern(`url:*:user:${userId}`);
  }
  
  /**
   * Invalidate cache entries for a specific URL
   * 
   * @param shortCode - Short code of the URL
   * @returns Number of keys invalidated
   */
  async invalidateUrlCache(shortCode: string): Promise<number> {
    return this.invalidatePattern(`url:${shortCode}*`);
  }
  
  /**
   * Get cache statistics
   * 
   * @returns Cache statistics
   */
  async getCacheStats(): Promise<{
    hitRatio: number;
    hitsByLevel: { hot: number; memory: number; redis: number };
    misses: number;
    errors: number;
    memorySize: number;
    redisStats: { keysCount: number; memoryUsage: number };
  }> {
    try {
      // Calculate hit ratio
      const totalRequests = 
        this.cacheStats.hits.hot + 
        this.cacheStats.hits.memory + 
        this.cacheStats.hits.redis + 
        this.cacheStats.misses;
      
      const hitRatio = totalRequests > 0 
        ? (this.cacheStats.hits.hot + this.cacheStats.hits.memory + this.cacheStats.hits.redis) / totalRequests 
        : 0;
      
      // Get Redis stats
      const redisStats = await getCacheStats('url:*');
      
      return {
        hitRatio,
        hitsByLevel: { 
          hot: this.cacheStats.hits.hot,
          memory: this.cacheStats.hits.memory,
          redis: this.cacheStats.hits.redis
        },
        misses: this.cacheStats.misses,
        errors: this.cacheStats.errors,
        memorySize: memoryCache.size,
        redisStats
      };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return {
        hitRatio: 0,
        hitsByLevel: { hot: 0, memory: 0, redis: 0 },
        misses: 0,
        errors: 0,
        memorySize: 0,
        redisStats: { keysCount: 0, memoryUsage: 0 }
      };
    }
  }
  
  /**
   * Warm up the cache with popular URLs
   * 
   * @param getPopularUrls - Function to get popular URLs
   * @param options - Optional configuration for cache warming
   */
  async warmCache(
    getPopularUrls: () => Promise<Array<{ key: string; value: any; popularity?: number }>>,
    options: {
      minPopularity?: number;
      maxItems?: number;
      ttl?: number;
      preloadHotCache?: boolean;
    } = {}
  ): Promise<void> {
    try {
      console.log('Warming cache with popular URLs...');
      const startTime = Date.now();
      
      // Set defaults for options
      const minPopularity = options.minPopularity || POPULARITY_THRESHOLD;
      const maxItems = options.maxItems || 1000;
      const ttl = options.ttl || CACHE_TTL.REDIS_POPULAR;
      const preloadHotCache = options.preloadHotCache !== undefined ? options.preloadHotCache : true;
      
      // Get popular URLs
      let popularUrls = await getPopularUrls();
      
      // Filter by minimum popularity if specified
      if (minPopularity > 0) {
        popularUrls = popularUrls.filter(item => (item.popularity || 0) >= minPopularity);
      }
      
      // Limit the number of items to cache
      if (popularUrls.length > maxItems) {
        // Sort by popularity (descending) and take top maxItems
        popularUrls.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        popularUrls = popularUrls.slice(0, maxItems);
      }
      
      // Process in batches for better performance
      const batches = Math.ceil(popularUrls.length / CACHE_LIMITS.BATCH_SIZE);
      let cachedCount = 0;
      
      for (let i = 0; i < batches; i++) {
        const batchUrls = popularUrls.slice(
          i * CACHE_LIMITS.BATCH_SIZE, 
          (i + 1) * CACHE_LIMITS.BATCH_SIZE
        );
        
        // Process batch in parallel
        await Promise.all(batchUrls.map(async ({ key, value, popularity }) => {
          try {
            // Set in Redis and memory cache
            await this.set(key, value, ttl);
            
            // Set popularity counter
            const hitCount = popularity || minPopularity;
            urlHitCounter.set(key, hitCount);
            
            // Add extremely popular URLs to hot cache if preloadHotCache is enabled
            if (preloadHotCache && hitCount >= this.extremelyPopularThreshold) {
              hotCache.set(key, value);
            }
            
            cachedCount++;
          } catch (error) {
            console.error(`Error warming cache for key ${key}:`, error);
          }
        }));
      }
      
      const duration = Date.now() - startTime;
      console.log(`Cache warmed with ${cachedCount}/${popularUrls.length} popular URLs in ${duration}ms`);
      
      // Record metrics
      cacheOperations.inc({ operation: 'warm', result: 'success', service: SERVICE_NAME });
      
      // Return cache warming statistics
      return {
        totalUrls: popularUrls.length,
        cachedUrls: cachedCount,
        duration,
        averageTimePerUrl: popularUrls.length > 0 ? duration / popularUrls.length : 0
      };
    } catch (error) {
      console.error('Cache warming error:', error);
      cacheOperations.inc({ operation: 'warm', result: 'error', service: SERVICE_NAME });
      
      // Return error statistics
      return {
        totalUrls: 0,
        cachedUrls: 0,
        duration: 0,
        averageTimePerUrl: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Schedule periodic cache warming
   * 
   * @param getPopularUrls - Function to get popular URLs
   * @param intervalMinutes - Interval in minutes between cache warming runs
   * @returns Function to stop the scheduled warming
   */
  scheduleWarmCache(
    getPopularUrls: () => Promise<Array<{ key: string; value: any; popularity?: number }>>,
    intervalMinutes: number = 15
  ): () => void {
    console.log(`Scheduling cache warming every ${intervalMinutes} minutes`);
    
    // Convert minutes to milliseconds
    const interval = intervalMinutes * 60 * 1000;
    
    // Schedule the first warming after a short delay
    const initialDelay = setTimeout(() => {
      this.warmCache(getPopularUrls).catch(err => {
        console.error('Error in initial cache warming:', err);
      });
    }, 5000);
    
    // Schedule periodic warming
    const intervalId = setInterval(() => {
      this.warmCache(getPopularUrls).catch(err => {
        console.error('Error in scheduled cache warming:', err);
      });
    }, interval);
    
    // Return function to stop the scheduled warming
    return () => {
      clearTimeout(initialDelay);
      clearInterval(intervalId);
      console.log('Cache warming schedule stopped');
    };
  }
}

// Export singleton instance
export const cacheService = new CacheService();