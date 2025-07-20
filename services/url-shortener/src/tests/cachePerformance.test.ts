import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { CacheService, CACHE_TTL, POPULARITY_THRESHOLD, CACHE_LIMITS } from '../services/cacheService';
import * as redisModule from '@url-shortener/shared-db';
import { performance } from 'perf_hooks';
import LRUCache from 'lru-cache';
import NodeCache from 'node-cache';

// Mock Redis module
vi.mock('@url-shortener/shared-db', () => {
  return {
    getCache: vi.fn(),
    setCache: vi.fn(),
    deleteCache: vi.fn(),
    getMultipleCache: vi.fn(),
    findCacheKeys: vi.fn(),
    getCacheStats: vi.fn().mockResolvedValue({ keysCount: 100, memoryUsage: 1024 }),
    getRedisClient: vi.fn(),
    closeRedisClient: vi.fn(),
    releaseRedisClient: vi.fn(),
  };
});

// Mock shared-monitoring module
vi.mock('@url-shortener/shared-monitoring', () => {
  return {
    cacheOperations: {
      inc: vi.fn(),
    },
    cacheHitRatio: {
      set: vi.fn(),
    },
  };
});

describe('Cache Performance Tests', () => {
  let cacheService: CacheService;
  
  beforeAll(() => {
    // Reset mocks before all tests
    vi.resetAllMocks();
  });
  
  beforeEach(() => {
    // Create a new instance for each test
    cacheService = new CacheService();
  });
  
  afterEach(() => {
    // Clear mocks after each test
    vi.clearAllMocks();
  });
  
  afterAll(() => {
    // Restore mocks after all tests
    vi.restoreAllMocks();
  });

  describe('Multi-level cache hit ratios', () => {
    it('should measure hit ratios across all cache levels', async () => {
      // Setup
      const testKey = 'test:key';
      const testValue = { id: '123', name: 'Test' };
      
      // Mock hot cache miss, memory cache hit
      vi.spyOn(NodeCache.prototype, 'get').mockReturnValue(undefined);
      vi.spyOn(LRUCache.prototype, 'get').mockReturnValue(testValue);
      
      // Execute - First call (memory hit)
      await cacheService.get(testKey);
      
      // Mock hot cache hit for second call
      vi.spyOn(NodeCache.prototype, 'get').mockReturnValue(testValue);
      
      // Execute - Second call (hot hit)
      await cacheService.get(testKey);
      
      // Mock both hot and memory cache miss, Redis hit for third call
      vi.spyOn(NodeCache.prototype, 'get').mockReturnValue(undefined);
      vi.spyOn(LRUCache.prototype, 'get').mockReturnValue(undefined);
      (redisModule.getCache as any).mockResolvedValue(testValue);
      
      // Execute - Third call (Redis hit)
      await cacheService.get(testKey);
      
      // Mock all cache levels miss for fourth call
      vi.spyOn(NodeCache.prototype, 'get').mockReturnValue(undefined);
      vi.spyOn(LRUCache.prototype, 'get').mockReturnValue(undefined);
      (redisModule.getCache as any).mockResolvedValue(null);
      
      // Execute - Fourth call (complete miss)
      await cacheService.get(testKey);
      
      // Get cache stats
      const stats = await cacheService.getCacheStats();
      
      // Verify hit ratios
      expect(stats.hitRatio).toBeCloseTo(0.75); // 3 hits out of 4 requests
      expect(stats.hitsByLevel.hot).toBe(1);
      expect(stats.hitsByLevel.memory).toBe(1);
      expect(stats.hitsByLevel.redis).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });

  describe('Cache warming performance', () => {
    it('should efficiently warm cache with popular URLs', async () => {
      // Setup
      const popularUrls = Array.from({ length: 100 }, (_, i) => ({
        key: `url:popular:${i}`,
        value: { id: `${i}`, shortCode: `abc${i}`, originalUrl: `https://example.com/${i}` },
        popularity: POPULARITY_THRESHOLD + i
      }));
      
      const getPopularUrls = vi.fn().mockResolvedValue(popularUrls);
      
      // Mock cache operations
      vi.spyOn(cacheService, 'set').mockResolvedValue();
      
      // Execute with performance measurement
      const startTime = performance.now();
      await cacheService.warmCache(getPopularUrls);
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Verify
      expect(getPopularUrls).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalledTimes(100);
      
      // Log performance metrics
      console.log(`Cache warming performance: ${duration.toFixed(2)}ms for 100 URLs`);
      console.log(`Average time per URL: ${(duration / 100).toFixed(2)}ms`);
      
      // Performance should be reasonable
      expect(duration / 100).toBeLessThan(10); // Less than 10ms per URL on average
    });
  });

  describe('Batch operations performance', () => {
    it('should efficiently handle batch get operations', async () => {
      // Setup
      const keys = Array.from({ length: 50 }, (_, i) => `url:batch:${i}`);
      const values = Object.fromEntries(
        keys.map(key => [key, { id: key, value: `Value for ${key}` }])
      );
      
      // Mock cache hits for different levels
      // 20% hot cache hits, 30% memory cache hits, 40% Redis hits, 10% misses
      vi.spyOn(NodeCache.prototype, 'get').mockImplementation((key: string) => {
        const index = parseInt(key.split(':')[2]);
        return index < 10 ? values[key] : undefined;
      });
      
      vi.spyOn(LRUCache.prototype, 'get').mockImplementation((key: string) => {
        const index = parseInt(key.split(':')[2]);
        return index >= 10 && index < 25 ? values[key] : undefined;
      });
      
      (redisModule.getMultipleCache as any).mockImplementation((keys: string[]) => {
        const result: Record<string, any> = {};
        keys.forEach(key => {
          const index = parseInt(key.split(':')[2]);
          result[key] = index >= 25 && index < 45 ? values[key] : null;
        });
        return Promise.resolve(result);
      });
      
      // Execute with performance measurement
      const startTime = performance.now();
      const result = await cacheService.getMultiple(keys);
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Verify
      expect(Object.keys(result).length).toBe(50);
      
      // Count hits and misses
      const hits = Object.values(result).filter(v => v !== null).length;
      const misses = Object.values(result).filter(v => v === null).length;
      
      expect(hits).toBe(45); // 90% hit rate (45/50)
      expect(misses).toBe(5); // 10% miss rate (5/50)
      
      // Log performance metrics
      console.log(`Batch get performance: ${duration.toFixed(2)}ms for 50 keys`);
      console.log(`Average time per key: ${(duration / 50).toFixed(2)}ms`);
      
      // Performance should be reasonable
      expect(duration / 50).toBeLessThan(5); // Less than 5ms per key on average
    });
  });

  describe('Cache invalidation performance', () => {
    it('should efficiently invalidate cache entries by pattern', async () => {
      // Setup
      const pattern = 'url:invalidate:*';
      const matchingKeys = Array.from({ length: 100 }, (_, i) => `url:invalidate:${i}`);
      
      // Mock findCacheKeys to return matching keys
      (redisModule.findCacheKeys as any).mockResolvedValue(matchingKeys);
      
      // Mock delete operations
      vi.spyOn(LRUCache.prototype, 'delete').mockReturnValue(true);
      vi.spyOn(NodeCache.prototype, 'del').mockReturnValue(1);
      (redisModule.deleteCache as any).mockResolvedValue(undefined);
      
      // Execute with performance measurement
      const startTime = performance.now();
      const invalidatedCount = await cacheService.invalidatePattern(pattern);
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Verify
      expect(invalidatedCount).toBe(100);
      expect(redisModule.findCacheKeys).toHaveBeenCalledWith(pattern);
      expect(LRUCache.prototype.delete).toHaveBeenCalledTimes(100);
      expect(NodeCache.prototype.del).toHaveBeenCalledTimes(100);
      expect(redisModule.deleteCache).toHaveBeenCalledTimes(100);
      
      // Log performance metrics
      console.log(`Cache invalidation performance: ${duration.toFixed(2)}ms for 100 keys`);
      console.log(`Average time per key: ${(duration / 100).toFixed(2)}ms`);
      
      // Performance should be reasonable
      expect(duration / 100).toBeLessThan(5); // Less than 5ms per key on average
    });
  });

  describe('High load simulation', () => {
    it('should maintain performance under high load', async () => {
      // Setup
      const iterations = 1000;
      const keys = Array.from({ length: 100 }, (_, i) => `url:highload:${i}`);
      
      // Mock cache hits with realistic distribution
      // 30% hot cache hits, 40% memory cache hits, 20% Redis hits, 10% misses
      vi.spyOn(NodeCache.prototype, 'get').mockImplementation((key: string) => {
        const index = parseInt(key.split(':')[2]);
        return index < 30 ? { value: `Hot cache value for ${key}` } : undefined;
      });
      
      vi.spyOn(LRUCache.prototype, 'get').mockImplementation((key: string) => {
        const index = parseInt(key.split(':')[2]);
        return index >= 30 && index < 70 ? { value: `Memory cache value for ${key}` } : undefined;
      });
      
      (redisModule.getCache as any).mockImplementation((key: string) => {
        const index = parseInt(key.split(':')[2]);
        return Promise.resolve(index >= 70 && index < 90 
          ? { value: `Redis value for ${key}` } 
          : null);
      });
      
      // Execute - Perform many cache operations in parallel
      const startTime = performance.now();
      
      const promises = Array.from({ length: iterations }, () => {
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        return cacheService.get(randomKey);
      });
      
      await Promise.all(promises);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Calculate operations per second
      const opsPerSecond = Math.floor((iterations / duration) * 1000);
      
      // Get cache stats
      const stats = await cacheService.getCacheStats();
      
      // Log performance metrics
      console.log(`High load performance: ${opsPerSecond} operations/second`);
      console.log(`Average operation time: ${(duration / iterations).toFixed(2)}ms`);
      console.log(`Cache hit ratio: ${stats.hitRatio.toFixed(4)}`);
      console.log(`Hits by level: Hot=${stats.hitsByLevel.hot}, Memory=${stats.hitsByLevel.memory}, Redis=${stats.hitsByLevel.redis}`);
      
      // Verify performance is acceptable
      expect(opsPerSecond).toBeGreaterThan(1000); // At least 1000 ops/second
      expect(duration / iterations).toBeLessThan(1); // Less than 1ms per operation
      expect(stats.hitRatio).toBeGreaterThan(0.8); // At least 80% hit ratio
    });
  });

  describe('Popularity promotion', () => {
    it('should correctly promote URLs based on popularity', async () => {
      // Setup
      const key = 'url:popular:test';
      const value = { id: '123', shortCode: 'abc123', originalUrl: 'https://example.com' };
      
      // Mock cache hits
      vi.spyOn(NodeCache.prototype, 'get').mockReturnValue(undefined);
      vi.spyOn(LRUCache.prototype, 'get').mockReturnValue(value);
      vi.spyOn(LRUCache.prototype, 'set').mockImplementation(() => {});
      vi.spyOn(NodeCache.prototype, 'set').mockImplementation(() => true);
      (redisModule.setCache as any).mockResolvedValue(undefined);
      
      // Execute - Hit the URL multiple times to reach popularity threshold
      for (let i = 0; i < POPULARITY_THRESHOLD; i++) {
        await cacheService.get(key);
      }
      
      // Verify promotion to popular status
      expect(redisModule.setCache).toHaveBeenCalledWith(key, value, CACHE_TTL.REDIS_POPULAR);
      expect(LRUCache.prototype.set).toHaveBeenCalledWith(
        key, 
        value, 
        expect.objectContaining({ ttl: CACHE_TTL.MEMORY_POPULAR * 1000 })
      );
      
      // Execute - Hit more times to reach extremely popular threshold
      const extremelyPopularThreshold = POPULARITY_THRESHOLD * 5;
      for (let i = 0; i < extremelyPopularThreshold; i++) {
        await cacheService.get(key);
      }
      
      // Verify promotion to hot cache
      expect(NodeCache.prototype.set).toHaveBeenCalledWith(key, value, expect.anything());
    });
  });
});

// Real-world simulation test
describe('Real-world cache simulation', () => {
  let cacheService: CacheService;
  
  beforeEach(() => {
    cacheService = new CacheService();
    
    // Reset mocks
    vi.clearAllMocks();
    
    // Setup realistic cache behavior with zipf distribution
    // (few very popular URLs, many less popular ones)
    vi.spyOn(NodeCache.prototype, 'get').mockImplementation((key: string) => {
      // Top 5% of URLs are in hot cache
      const urlId = parseInt(key.split(':')[1] || '0');
      return urlId < 50 ? { id: urlId, value: `Hot value ${urlId}` } : undefined;
    });
    
    vi.spyOn(LRUCache.prototype, 'get').mockImplementation((key: string) => {
      // Next 20% of URLs are in memory cache
      const urlId = parseInt(key.split(':')[1] || '0');
      return urlId >= 50 && urlId < 250 ? { id: urlId, value: `Memory value ${urlId}` } : undefined;
    });
    
    (redisModule.getCache as any).mockImplementation((key: string) => {
      // Next 30% of URLs are in Redis
      const urlId = parseInt(key.split(':')[1] || '0');
      return Promise.resolve(
        urlId >= 250 && urlId < 550 ? { id: urlId, value: `Redis value ${urlId}` } : null
      );
    });
  });
  
  it('should handle realistic URL access patterns efficiently', async () => {
    // Setup - Create zipf-like distribution of URL popularity
    // (few very popular URLs, many less popular ones)
    const generateZipfDistribution = (size: number, skew: number = 1.0): number[] => {
      const distribution: number[] = [];
      let sum = 0;
      
      for (let i = 1; i <= size; i++) {
        // Zipf formula: frequency ∝ 1/rank^skew
        const frequency = 1.0 / Math.pow(i, skew);
        distribution.push(frequency);
        sum += frequency;
      }
      
      // Normalize to create probability distribution
      return distribution.map(freq => freq / sum);
    };
    
    // Create distribution for 1000 URLs
    const probabilities = generateZipfDistribution(1000);
    
    // Function to select URL based on zipf distribution
    const selectUrlByProbability = (): string => {
      const rand = Math.random();
      let cumulativeProbability = 0;
      
      for (let i = 0; i < probabilities.length; i++) {
        cumulativeProbability += probabilities[i];
        if (rand < cumulativeProbability) {
          return `url:${i}`;
        }
      }
      
      return 'url:0'; // Fallback
    };
    
    // Execute - Simulate 10,000 URL accesses with zipf distribution
    const iterations = 10000;
    const startTime = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      const key = selectUrlByProbability();
      await cacheService.get(key);
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Get cache stats
    const stats = await cacheService.getCacheStats();
    
    // Calculate operations per second
    const opsPerSecond = Math.floor((iterations / duration) * 1000);
    
    // Log performance metrics
    console.log(`Real-world simulation: ${opsPerSecond} operations/second`);
    console.log(`Average operation time: ${(duration / iterations).toFixed(2)}ms`);
    console.log(`Cache hit ratio: ${stats.hitRatio.toFixed(4)}`);
    console.log(`Hits by level: Hot=${stats.hitsByLevel.hot}, Memory=${stats.hitsByLevel.memory}, Redis=${stats.hitsByLevel.redis}`);
    
    // Verify performance meets requirements
    expect(opsPerSecond).toBeGreaterThan(5000); // At least 5000 ops/second
    expect(duration / iterations).toBeLessThan(0.2); // Less than 0.2ms per operation
    expect(stats.hitRatio).toBeGreaterThan(0.5); // At least 50% hit ratio
    
    // Verify distribution of hits matches expected pattern
    // Hot cache should have most hits due to zipf distribution
    expect(stats.hitsByLevel.hot).toBeGreaterThan(stats.hitsByLevel.memory);
    expect(stats.hitsByLevel.memory).toBeGreaterThan(stats.hitsByLevel.redis);
  });
});