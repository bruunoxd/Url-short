import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';
import { RateLimiter } from '../src/rateLimiter';
import { rateLimiter, dynamicRateLimiter } from '../src/middleware';

// Mock Redis client
vi.mock('@url-shortener/shared-db', () => {
  const mockRedisClient = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  };
  
  return {
    getRedisClient: vi.fn().mockResolvedValue(mockRedisClient),
    releaseRedisClient: vi.fn().mockResolvedValue(undefined),
  };
});

// Import mocked Redis client
import { getRedisClient, releaseRedisClient } from '@url-shortener/shared-db';

describe('RateLimiter', () => {
  const mockRedisClient = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
    (getRedisClient as any).mockResolvedValue(mockRedisClient);
  });
  
  describe('check', () => {
    it('should create a new rate limit record if none exists', async () => {
      // Mock Redis get to return null (no existing record)
      mockRedisClient.get.mockResolvedValue(null);
      
      const result = await RateLimiter.check('test-key', 100, 60);
      
      // Verify Redis interactions
      expect(getRedisClient).toHaveBeenCalled();
      expect(mockRedisClient.get).toHaveBeenCalledWith('rate_limit:test-key');
      expect(mockRedisClient.set).toHaveBeenCalled();
      expect(releaseRedisClient).toHaveBeenCalledWith(mockRedisClient);
      
      // Verify result
      expect(result).toEqual({
        count: 1,
        limit: 100,
        windowSizeInSeconds: 60,
        resetTime: expect.any(Number),
      });
    });
    
    it('should increment an existing rate limit record', async () => {
      // Mock existing rate limit data
      const now = Date.now();
      const existingData = {
        count: 5,
        resetTime: now + 30000, // 30 seconds in the future
        windowSizeInSeconds: 60,
        limit: 100
      };
      
      mockRedisClient.get.mockResolvedValue(JSON.stringify(existingData));
      
      const result = await RateLimiter.check('test-key', 100, 60);
      
      // Verify Redis interactions
      expect(mockRedisClient.get).toHaveBeenCalledWith('rate_limit:test-key');
      expect(mockRedisClient.set).toHaveBeenCalled();
      
      // Verify result
      expect(result).toEqual({
        ...existingData,
        count: 6, // Incremented
      });
    });
    
    it('should create a new window if the previous one expired', async () => {
      // Mock expired rate limit data
      const now = Date.now();
      const existingData = {
        count: 5,
        resetTime: now - 1000, // 1 second in the past
        windowSizeInSeconds: 60,
        limit: 100
      };
      
      mockRedisClient.get.mockResolvedValue(JSON.stringify(existingData));
      
      const result = await RateLimiter.check('test-key', 100, 60);
      
      // Verify result
      expect(result).toEqual({
        count: 1, // Reset to 1
        limit: 100,
        windowSizeInSeconds: 60,
        resetTime: expect.any(Number),
      });
    });
  });
  
  describe('reset', () => {
    it('should delete the rate limit record', async () => {
      await RateLimiter.reset('test-key');
      
      expect(mockRedisClient.del).toHaveBeenCalledWith('rate_limit:test-key');
    });
  });
  
  describe('get', () => {
    it('should return null if no rate limit record exists', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      
      const result = await RateLimiter.get('test-key');
      
      expect(result).toBeNull();
    });
    
    it('should return the rate limit record if it exists', async () => {
      const existingData = {
        count: 5,
        resetTime: Date.now() + 30000,
        windowSizeInSeconds: 60,
        limit: 100
      };
      
      mockRedisClient.get.mockResolvedValue(JSON.stringify(existingData));
      
      const result = await RateLimiter.get('test-key');
      
      expect(result).toEqual(existingData);
    });
  });
});

describe('Rate Limiting Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: vi.Mock;
  
  beforeEach(() => {
    mockRequest = {
      ip: '127.0.0.1',
      headers: {},
      user: undefined,
      socket: {
        remoteAddress: '127.0.0.1'
      } as any
    };
    
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn()
    };
    
    nextFunction = vi.fn();
    
    vi.spyOn(RateLimiter, 'check').mockImplementation(async (key, limit, window) => {
      return {
        count: 1,
        limit,
        windowSizeInSeconds: window,
        resetTime: Date.now() + window * 1000
      };
    });
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  it('should call next() when rate limit is not exceeded', async () => {
    const middleware = rateLimiter('test', { limit: 100, windowSizeInSeconds: 60 });
    
    await middleware(mockRequest as Request, mockResponse as Response, nextFunction);
    
    expect(nextFunction).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });
  
  it('should return 429 when rate limit is exceeded', async () => {
    vi.spyOn(RateLimiter, 'check').mockImplementation(async () => {
      return {
        count: 101, // Exceeds limit
        limit: 100,
        windowSizeInSeconds: 60,
        resetTime: Date.now() + 60000
      };
    });
    
    const middleware = rateLimiter('test', { limit: 100, windowSizeInSeconds: 60 });
    
    await middleware(mockRequest as Request, mockResponse as Response, nextFunction);
    
    expect(nextFunction).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(429);
    expect(mockResponse.json).toHaveBeenCalled();
  });
  
  it('should set rate limit headers', async () => {
    const middleware = rateLimiter('test', { 
      limit: 100, 
      windowSizeInSeconds: 60,
      headers: true
    });
    
    await middleware(mockRequest as Request, mockResponse as Response, nextFunction);
    
    expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
    expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');
    expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Used', '1');
    expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
  });
  
  it('should use custom key generator if provided', async () => {
    const keyGenerator = vi.fn().mockReturnValue('custom-key');
    
    const middleware = rateLimiter('test', {
      limit: 100,
      windowSizeInSeconds: 60,
      keyGenerator
    });
    
    await middleware(mockRequest as Request, mockResponse as Response, nextFunction);
    
    expect(keyGenerator).toHaveBeenCalledWith(mockRequest);
  });
  
  it('should skip rate limiting if skip function returns true', async () => {
    const skip = vi.fn().mockReturnValue(true);
    
    const middleware = rateLimiter('test', {
      limit: 100,
      windowSizeInSeconds: 60,
      skip
    });
    
    await middleware(mockRequest as Request, mockResponse as Response, nextFunction);
    
    expect(skip).toHaveBeenCalledWith(mockRequest);
    expect(RateLimiter.check).not.toHaveBeenCalled();
    expect(nextFunction).toHaveBeenCalled();
  });
  
  it('should use different limits for authenticated and anonymous users', async () => {
    // Test with anonymous user
    const middleware = dynamicRateLimiter('test', {
      authenticated: { limit: 100, windowSizeInSeconds: 60 },
      anonymous: { limit: 20, windowSizeInSeconds: 60 }
    });
    
    await middleware(mockRequest as Request, mockResponse as Response, nextFunction);
    
    // Should use anonymous limit
    expect(RateLimiter.check).toHaveBeenCalledWith(
      expect.stringContaining('ip'),
      20,
      60
    );
    
    // Reset mocks
    vi.clearAllMocks();
    
    // Test with authenticated user
    mockRequest.user = { userId: 'user123', email: 'test@example.com', permissions: [] };
    
    await middleware(mockRequest as Request, mockResponse as Response, nextFunction);
    
    // Should use authenticated limit
    expect(RateLimiter.check).toHaveBeenCalledWith(
      expect.stringContaining('user123'),
      100,
      60
    );
  });
});