import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { CacheService, CACHE_TTL, POPULARITY_THRESHOLD } from '../services/cacheService';
import * as redisModule from '@url-shortener/shared-db';
import LRUCache from 'lru-cache';

// Mock Redis module
vi.mock('@url-shortener/shared-db', () => {
  return {
    getCache: vi.fn(),
    setCache: vi.fn(),
    deleteCache: vi.fn(),
    getRedisClient: vi.fn(),
    closeRedisClient: vi.fn(),
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

describe('CacheService', () => {
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
  
  describe('get', () => {
    it('should return value from memory cache if available', async () => {
      // Setup
      const key = 'test:key';
      const value = { id: '123', name: 'Test' };
      
      // Mock the memory cache to have the value
      vi.spyOn(LRUCache.prototype, 'get').mockReturnValue(value);
      
      // Execute
      const result = await cacheService.get(key);
      
      // Verify
      expect(result).toEqual(value);
      expect(LRUCache.prototype.get).toHaveBeenCalledWith(key);
      expect(redisModule.getCache).not.toHaveBeenCalled();
    });
    
    it('should fetch from Redis if not in memory cache', async () => {
      // Setup
      const key = 'test:key';
      const value = { id: '123', name: 'Test' };
      
      // Mock memory cache to miss
      vi.spyOn(LRUCache.prototype, 'get').mockReturnValue(undefined);
      
      // Mock Redis to have the value
      (redisModule.getCache as any).mockResolvedValue(value);
      
      // Mock memory cache set
      vi.spyOn(LRUCache.prototype, 'set').mockImplementation(() => {});
      
      // Execute
      const result = await cacheService.get(key);
      
      // Verify
      expect(result).toEqual(value);
      expect(LRUCache.prototype.get).toHaveBeenCalledWith(key);
      expect(redisModule.getCache).toHaveBeenCalledWith(key);
      expect(LRUCache.prototype.set).toHaveBeenCalled();
    });
    
    it('should return null if value not found in any cache', async () => {
      // Setup
      const key = 'test:key';
      
      // Mock memory cache to miss
      vi.spyOn(LRUCache.prototype, 'get').mockReturnValue(undefined);
      
      // Mock Redis to miss
      (redisModule.getCache as any).mockResolvedValue(null);
      
      // Execute
      const result = await cacheService.get(key);
      
      // Verify
      expect(result).toBeNull();
      expect(LRUCache.prototype.get).toHaveBeenCalledWith(key);
      expect(redisModule.getCache).toHaveBeenCalledWith(key);
    });
    
    it('should handle errors gracefully', async () => {
      // Setup
      const key = 'test:key';
      
      // Mock memory cache to throw
      vi.spyOn(LRUCache.prototype, 'get').mockImplementation(() => {
        throw new Error('Memory cache error');
      });
      
      // Execute
      const result = await cacheService.get(key);
      
      // Verify
      expect(result).toBeNull();
    });
  });
  
  describe('set', () => {
    it('should set value in both memory and Redis caches', async () => {
      // Setup
      const key = 'test:key';
      const value = { id: '123', name: 'Test' };
      
      // Mock cache set functions
      vi.spyOn(LRUCache.prototype, 'set').mockImplementation(() => {});
      (redisModule.setCache as any).mockResolvedValue(undefined);
      
      // Execute
      await cacheService.set(key, value);
      
      // Verify
      expect(LRUCache.prototype.set).toHaveBeenCalled();
      expect(redisModule.setCache).toHaveBeenCalled();
    });
    
    it('should use longer TTL for popular URLs', async () => {
      // Setup
      const key = 'test:key';
      const value = { id: '123', name: 'Test' };
      
      // Mock isPopularUrl to return true
      vi.spyOn(cacheService as any, 'isPopularUrl').mockReturnValue(true);
      
      // Mock cache set functions
      vi.spyOn(LRUCache.prototype, 'set').mockImplementation(() => {});
      (redisModule.setCache as any).mockResolvedValue(undefined);
      
      // Execute
      await cacheService.set(key, value);
      
      // Verify
      expect(redisModule.setCache).toHaveBeenCalledWith(key, value, CACHE_TTL.REDIS_POPULAR);
      expect(LRUCache.prototype.set).toHaveBeenCalledWith(key, value, { ttl: CACHE_TTL.MEMORY_POPULAR * 1000 });
    });
    
    it('should handle errors gracefully', async () => {
      // Setup
      const key = 'test:key';
      const value = { id: '123', name: 'Test' };
      
      // Mock Redis to throw
      (redisModule.setCache as any).mockRejectedValue(new Error('Redis error'));
      
      // Execute & Verify (should not throw)
      await expect(cacheService.set(key, value)).resolves.not.toThrow();
    });
  });
  
  describe('delete', () => {
    it('should delete value from both memory and Redis caches', async () => {
      // Setup
      const key = 'test:key';
      
      // Mock cache delete functions
      vi.spyOn(LRUCache.prototype, 'delete').mockImplementation(() => true);
      (redisModule.deleteCache as any).mockResolvedValue(undefined);
      
      // Execute
      await cacheService.delete(key);
      
      // Verify
      expect(LRUCache.prototype.delete).toHaveBeenCalledWith(key);
      expect(redisModule.deleteCache).toHaveBeenCalledWith(key);
    });
    
    it('should handle errors gracefully', async () => {
      // Setup
      const key = 'test:key';
      
      // Mock Redis to throw
      (redisModule.deleteCache as any).mockRejectedValue(new Error('Redis error'));
      
      // Execute & Verify (should not throw)
      await expect(cacheService.delete(key)).resolves.not.toThrow();
    });
  });
  
  describe('warmCache', () => {
    it('should warm cache with popular URLs', async () => {
      // Setup
      const popularUrls = [
        { key: 'url:abc123', value: { id: '1', shortCode: 'abc123' } },
        { key: 'url:def456', value: { id: '2', shortCode: 'def456' } }
      ];
      
      const getPopularUrls = vi.fn().mockResolvedValue(popularUrls);
      
      // Mock set method
      vi.spyOn(cacheService, 'set').mockResolvedValue();
      
      // Execute
      await cacheService.warmCache(getPopularUrls);
      
      // Verify
      expect(getPopularUrls).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalledTimes(2);
      expect(cacheService.set).toHaveBeenCalledWith('url:abc123', { id: '1', shortCode: 'abc123' }, CACHE_TTL.REDIS_POPULAR);
      expect(cacheService.set).toHaveBeenCalledWith('url:def456', { id: '2', shortCode: 'def456' }, CACHE_TTL.REDIS_POPULAR);
    });
    
    it('should handle errors gracefully', async () => {
      // Setup
      const getPopularUrls = vi.fn().mockRejectedValue(new Error('Database error'));
      
      // Execute & Verify (should not throw)
      await expect(cacheService.warmCache(getPopularUrls)).resolves.not.toThrow();
    });
  });
  
  describe('Cache hit ratio performance', () => {
    it('should measure cache hit ratio correctly', async () => {
      // Setup
      const key = 'test:key';
      const value = { id: '123', name: 'Test' };
      
      // Mock memory cache to have the value for first call
      const getLRUCacheSpy = vi.spyOn(LRUCache.prototype, 'get')
        .mockReturnValueOnce(value)  // First call - memory hit
        .mockReturnValueOnce(undefined); // Second call - memory miss
      
      // Mock Redis to have the value for second call
      (redisModule.getCache as any)
        .mockResolvedValueOnce(value); // Second call - Redis hit
      
      // Mock memory cache set
      vi.spyOn(LRUCache.prototype, 'set').mockImplementation(() => {});
      
      // Execute - First call (memory hit)
      await cacheService.get(key);
      
      // Execute - Second call (memory miss, Redis hit)
      await cacheService.get(key);
      
      // Verify
      expect(getLRUCacheSpy).toHaveBeenCalledTimes(2);
      expect(redisModule.getCache).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('Popularity tracking', () => {
    it('should promote URLs to popular status after reaching threshold', async () => {
      // Setup
      const key = 'test:key';
      const value = { id: '123', name: 'Test' };
      
      // Mock memory cache to always have the value
      vi.spyOn(LRUCache.prototype, 'get').mockReturnValue(value);
      
      // Spy on private methods
      const promoteSpy = vi.spyOn(cacheService as any, 'promoteToPopular').mockResolvedValue(undefined);
      
      // Execute - Hit the URL multiple times to reach popularity threshold
      for (let i = 0; i < POPULARITY_THRESHOLD; i++) {
        await cacheService.get(key);
      }
      
      // Verify
      expect(promoteSpy).toHaveBeenCalledWith(key);
    });
  });
});

// Performance test for cache hit ratio
describe('Cache Performance Tests', () => {
  let cacheService: CacheService;
  
  beforeEach(() => {
    cacheService = new CacheService();
  });
  
  it('should handle high volume of cache operations efficiently', async () => {
    // Setup
    const iterations = 1000;
    const keys = Array.from({ length: 100 }, (_, i) => `test:key:${i}`);
    
    // Mock memory cache to hit 70% of the time
    vi.spyOn(LRUCache.prototype, 'get').mockImplementation((key: string) => {
      // 70% hit rate for memory cache
      return Math.random() < 0.7 ? { value: key } : undefined;
    });
    
    // Mock Redis to hit 80% of the time for the remaining 30%
    (redisModule.getCache as any).mockImplementation((key: string) => {
      // 80% hit rate for Redis cache (for the 30% that missed memory)
      return Promise.resolve(Math.random() < 0.8 ? { value: key } : null);
    });
    
    // Mock set operations
    vi.spyOn(LRUCache.prototype, 'set').mockImplementation(() => {});
    (redisModule.setCache as any).mockResolvedValue(undefined);
    
    // Execute - Perform many cache operations
    const startTime = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      await cacheService.get(randomKey);
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Calculate operations per second
    const opsPerSecond = Math.floor((iterations / duration) * 1000);
    
    console.log(`Cache performance: ${opsPerSecond} operations/second`);
    console.log(`Average operation time: ${duration / iterations}ms`);
    
    // Verify performance is acceptable (adjust thresholds as needed)
    expect(opsPerSecond).toBeGreaterThan(100); // At least 100 ops/second
    expect(duration / iterations).toBeLessThan(10); // Less than 10ms per operation
  });
});