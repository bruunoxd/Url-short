import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { CacheService, CACHE_TTL, POPULARITY_THRESHOLD } from '../services/cacheService';
import * as redisModule from '@url-shortener/shared-db';
import { performance } from 'perf_hooks';

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

describe('Cache Warming Tests', () => {
  let cacheService: CacheService;
  
  beforeAll(() => {
    // Reset mocks before all tests
    vi.resetAllMocks();
  });
  
  beforeEach(() => {
    // Create a new instance for each test
    cacheService = new CacheService();
    
    // Reset mocks
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    // Clear mocks after each test
    vi.clearAllMocks();
  });
  
  afterAll(() => {
    // Restore mocks after all tests
    vi.restoreAllMocks();
  });

  describe('Cache warming functionality', () => {
    it('should warm cache with popular URLs', async () => {
      // Setup
      const popularUrls = [
        { key: 'url:abc123', value: { id: '1', shortCode: 'abc123' }, popularity: 15 },
        { key: 'url:def456', value: { id: '2', shortCode: 'def456' }, popularity: 25 },
        { key: 'url:ghi789', value: { id: '3', shortCode: 'ghi789' }, popularity: 5 }
      ];
      
      const getPopularUrls = vi.fn().mockResolvedValue(popularUrls);
      
      // Mock set method
      vi.spyOn(cacheService, 'set').mockResolvedValue();
      
      // Execute
      const result = await cacheService.warmCache(getPopularUrls);
      
      // Verify
      expect(getPopularUrls).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalledTimes(3);
      expect(cacheService.set).toHaveBeenCalledWith('url:abc123', { id: '1', shortCode: 'abc123' }, CACHE_TTL.REDIS_POPULAR);
      expect(cacheService.set).toHaveBeenCalledWith('url:def456', { id: '2', shortCode: 'def456' }, CACHE_TTL.REDIS_POPULAR);
      expect(cacheService.set).toHaveBeenCalledWith('url:ghi789', { id: '3', shortCode: 'ghi789' }, CACHE_TTL.REDIS_POPULAR);
      
      // Verify result statistics
      expect(result).toHaveProperty('totalUrls', 3);
      expect(result).toHaveProperty('cachedUrls', 3);
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('averageTimePerUrl');
    });
    
    it('should filter URLs by minimum popularity', async () => {
      // Setup
      const popularUrls = [
        { key: 'url:abc123', value: { id: '1', shortCode: 'abc123' }, popularity: 15 },
        { key: 'url:def456', value: { id: '2', shortCode: 'def456' }, popularity: 25 },
        { key: 'url:ghi789', value: { id: '3', shortCode: 'ghi789' }, popularity: 5 }
      ];
      
      const getPopularUrls = vi.fn().mockResolvedValue(popularUrls);
      
      // Mock set method
      vi.spyOn(cacheService, 'set').mockResolvedValue();
      
      // Execute with minimum popularity of 10
      const result = await cacheService.warmCache(getPopularUrls, { minPopularity: 10 });
      
      // Verify
      expect(getPopularUrls).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalledTimes(2); // Only 2 URLs meet the criteria
      expect(cacheService.set).toHaveBeenCalledWith('url:abc123', { id: '1', shortCode: 'abc123' }, CACHE_TTL.REDIS_POPULAR);
      expect(cacheService.set).toHaveBeenCalledWith('url:def456', { id: '2', shortCode: 'def456' }, CACHE_TTL.REDIS_POPULAR);
      
      // Verify result statistics
      expect(result).toHaveProperty('totalUrls', 2);
      expect(result).toHaveProperty('cachedUrls', 2);
    });
    
    it('should limit the number of URLs to cache', async () => {
      // Setup
      const popularUrls = Array.from({ length: 100 }, (_, i) => ({
        key: `url:key${i}`,
        value: { id: `${i}`, shortCode: `code${i}` },
        popularity: 10 + i
      }));
      
      const getPopularUrls = vi.fn().mockResolvedValue(popularUrls);
      
      // Mock set method
      vi.spyOn(cacheService, 'set').mockResolvedValue();
      
      // Execute with maxItems of 20
      const result = await cacheService.warmCache(getPopularUrls, { maxItems: 20 });
      
      // Verify
      expect(getPopularUrls).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalledTimes(20);
      
      // Verify result statistics
      expect(result).toHaveProperty('totalUrls', 20);
      expect(result).toHaveProperty('cachedUrls', 20);
    });
    
    it('should handle errors during cache warming', async () => {
      // Setup
      const getPopularUrls = vi.fn().mockRejectedValue(new Error('Database error'));
      
      // Execute
      const result = await cacheService.warmCache(getPopularUrls);
      
      // Verify
      expect(getPopularUrls).toHaveBeenCalled();
      expect(cacheService.set).not.toHaveBeenCalled();
      
      // Verify error handling
      expect(result).toHaveProperty('error', 'Database error');
      expect(result).toHaveProperty('totalUrls', 0);
      expect(result).toHaveProperty('cachedUrls', 0);
    });
  });

  describe('Scheduled cache warming', () => {
    beforeEach(() => {
      // Mock timers
      vi.useFakeTimers();
    });
    
    afterEach(() => {
      // Restore timers
      vi.useRealTimers();
    });
    
    it('should schedule periodic cache warming', async () => {
      // Setup
      const popularUrls = [
        { key: 'url:abc123', value: { id: '1', shortCode: 'abc123' } },
        { key: 'url:def456', value: { id: '2', shortCode: 'def456' } }
      ];
      
      const getPopularUrls = vi.fn().mockResolvedValue(popularUrls);
      
      // Mock warmCache method
      const warmCacheSpy = vi.spyOn(cacheService, 'warmCache').mockResolvedValue({
        totalUrls: 2,
        cachedUrls: 2,
        duration: 100,
        averageTimePerUrl: 50
      });
      
      // Execute - Schedule warming every 5 minutes
      const stopWarming = cacheService.scheduleWarmCache(getPopularUrls, 5);
      
      // Verify initial warming is scheduled
      expect(setTimeout).toHaveBeenCalledTimes(1);
      expect(setInterval).toHaveBeenCalledTimes(1);
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000);
      
      // Fast-forward to trigger initial warming
      vi.advanceTimersByTime(5000);
      
      // Verify initial warming was triggered
      expect(warmCacheSpy).toHaveBeenCalledTimes(1);
      
      // Fast-forward to trigger interval warming
      vi.advanceTimersByTime(5 * 60 * 1000);
      
      // Verify interval warming was triggered
      expect(warmCacheSpy).toHaveBeenCalledTimes(2);
      
      // Stop warming
      stopWarming();
      
      // Verify timers were cleared
      expect(clearTimeout).toHaveBeenCalledTimes(1);
      expect(clearInterval).toHaveBeenCalledTimes(1);
      
      // Fast-forward again to verify no more warming occurs
      vi.advanceTimersByTime(5 * 60 * 1000);
      expect(warmCacheSpy).toHaveBeenCalledTimes(2); // Still 2 calls
    });
  });
});