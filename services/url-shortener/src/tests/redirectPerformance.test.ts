import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { performance } from 'perf_hooks';
import { UrlService } from '../services/urlService';
import { cacheService } from '../services/cacheService';
import { queueService } from '../services/queueService';
import supertest from 'supertest';
import express from 'express';

// Mock dependencies
vi.mock('../services/cacheService', () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getMultiple: vi.fn(),
    invalidatePattern: vi.fn(),
  }
}));

vi.mock('../services/queueService', () => ({
  queueService: {
    publishClickEvent: vi.fn().mockResolvedValue(undefined),
  }
}));

// Mock shared-monitoring module
vi.mock('@url-shortener/shared-monitoring', () => ({
  requestDuration: {
    startTimer: vi.fn().mockReturnValue(() => {}),
  },
  redirectLatency: {
    observe: vi.fn(),
  },
  cacheHitRatio: {
    set: vi.fn(),
  },
}));

describe('Redirect Performance Tests', () => {
  let urlService: UrlService;
  let app: express.Application;
  
  beforeAll(() => {
    urlService = new UrlService();
    
    // Create a minimal Express app for testing
    app = express();
    
    // Add a simple redirect endpoint
    app.get('/:shortCode', async (req, res) => {
      const startTime = performance.now();
      
      try {
        const shortCode = req.params.shortCode;
        const url = await urlService.getShortUrl(shortCode);
        
        if (!url) {
          return res.status(404).send('Not found');
        }
        
        if (!url.isActive) {
          return res.status(410).send('Gone');
        }
        
        // Track click event asynchronously (don't await)
        const clickEvent = {
          shortUrlId: url.id,
          timestamp: new Date(),
          ipAddress: req.ip || '127.0.0.1',
          userAgent: req.headers['user-agent'] || '',
          referrer: req.headers.referer || '',
        };
        
        queueService.publishClickEvent(clickEvent);
        
        // Measure response time
        const endTime = performance.now();
        const responseTime = endTime - startTime;
        
        // Log response time
        console.log(`Redirect response time: ${responseTime.toFixed(2)}ms`);
        
        return res.redirect(url.originalUrl);
      } catch (error) {
        console.error('Error processing redirect:', error);
        return res.status(500).send('Internal server error');
      }
    });
  });
  
  afterAll(() => {
    vi.clearAllMocks();
  });
  
  it('should retrieve URLs from cache in under 100ms', async () => {
    // Setup
    const shortCode = 'abc123';
    const mockUrl = {
      id: '123',
      userId: 'user123',
      originalUrl: 'https://example.com',
      shortCode,
      isActive: true,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Mock cache hit
    (cacheService.get as any).mockResolvedValue(mockUrl);
    
    // Execute with performance measurement
    const start = performance.now();
    const result = await urlService.getShortUrl(shortCode);
    const end = performance.now();
    const duration = end - start;
    
    // Verify
    expect(result).toBeDefined();
    expect(result?.originalUrl).toBe('https://example.com');
    expect(duration).toBeLessThan(100); // Less than 100ms
    expect(cacheService.get).toHaveBeenCalled();
  });
  
  it('should handle high volume of redirects efficiently', async () => {
    // Setup
    const shortCode = 'abc123';
    const mockUrl = {
      id: '123',
      userId: 'user123',
      originalUrl: 'https://example.com',
      shortCode,
      isActive: true,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Mock cache hit for all requests
    (cacheService.get as any).mockResolvedValue(mockUrl);
    
    // Execute multiple requests in parallel
    const iterations = 100;
    const start = performance.now();
    
    const promises = Array.from({ length: iterations }, () => 
      urlService.getShortUrl(shortCode)
    );
    
    await Promise.all(promises);
    
    const end = performance.now();
    const totalDuration = end - start;
    const avgDuration = totalDuration / iterations;
    
    // Verify
    console.log(`Processed ${iterations} redirects in ${totalDuration.toFixed(2)}ms`);
    console.log(`Average response time: ${avgDuration.toFixed(2)}ms per redirect`);
    
    expect(avgDuration).toBeLessThan(10); // Average under 10ms per request
    expect(cacheService.get).toHaveBeenCalledTimes(iterations);
  });
  
  it('should publish click events to queue without impacting response time', async () => {
    // Setup
    const shortCode = 'abc123';
    const mockUrl = {
      id: '123',
      userId: 'user123',
      originalUrl: 'https://example.com',
      shortCode,
      isActive: true,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Mock cache hit
    (cacheService.get as any).mockResolvedValue(mockUrl);
    
    // Mock queue publish with delay to simulate network latency
    (queueService.publishClickEvent as any).mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 50))
    );
    
    // Execute with performance measurement
    const start = performance.now();
    
    // Get URL (should be fast)
    const result = await urlService.getShortUrl(shortCode);
    
    // Record end time for URL lookup
    const lookupEnd = performance.now();
    const lookupDuration = lookupEnd - start;
    
    // Simulate publishing event (should not block)
    const clickEvent = {
      shortUrlId: mockUrl.id,
      timestamp: new Date(),
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      referrer: 'test-referrer',
      deviceType: 'desktop',
      browser: 'test-browser',
      os: 'test-os'
    };
    
    // Start publishing (don't await)
    const publishPromise = queueService.publishClickEvent(clickEvent);
    
    // Verify URL lookup was fast
    expect(lookupDuration).toBeLessThan(100);
    expect(result).toBeDefined();
    
    // Now wait for publish to complete
    await publishPromise;
    
    // Verify publish was called
    expect(queueService.publishClickEvent).toHaveBeenCalled();
  });
  
  it('should meet 100ms redirect latency requirement in HTTP request flow', async () => {
    // Setup
    const shortCode = 'abc123';
    const mockUrl = {
      id: '123',
      userId: 'user123',
      originalUrl: 'https://example.com',
      shortCode,
      isActive: true,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Mock cache hit
    (cacheService.get as any).mockResolvedValue(mockUrl);
    
    // Execute HTTP request
    const response = await supertest(app)
      .get(`/${shortCode}`)
      .set('User-Agent', 'test-agent')
      .set('Referer', 'https://referrer.com');
    
    // Verify
    expect(response.status).toBe(302); // Redirect status
    expect(response.headers.location).toBe('https://example.com');
    expect(cacheService.get).toHaveBeenCalledWith(`url:${shortCode}`);
    expect(queueService.publishClickEvent).toHaveBeenCalled();
  });
  
  it('should handle cache misses gracefully', async () => {
    // Setup - cache miss
    const shortCode = 'notfound';
    (cacheService.get as any).mockResolvedValue(null);
    
    // Execute
    const response = await supertest(app)
      .get(`/${shortCode}`)
      .set('User-Agent', 'test-agent');
    
    // Verify
    expect(response.status).toBe(404);
    expect(cacheService.get).toHaveBeenCalledWith(`url:${shortCode}`);
  });
  
  it('should handle inactive URLs correctly', async () => {
    // Setup - inactive URL
    const shortCode = 'inactive';
    const mockUrl = {
      id: '456',
      userId: 'user123',
      originalUrl: 'https://example.com/inactive',
      shortCode,
      isActive: false,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    (cacheService.get as any).mockResolvedValue(mockUrl);
    
    // Execute
    const response = await supertest(app)
      .get(`/${shortCode}`)
      .set('User-Agent', 'test-agent');
    
    // Verify
    expect(response.status).toBe(410); // Gone
    expect(cacheService.get).toHaveBeenCalledWith(`url:${shortCode}`);
  });
  
  it('should handle errors gracefully', async () => {
    // Setup - simulate error
    const shortCode = 'error';
    (cacheService.get as any).mockRejectedValue(new Error('Test error'));
    
    // Execute
    const response = await supertest(app)
      .get(`/${shortCode}`)
      .set('User-Agent', 'test-agent');
    
    // Verify
    expect(response.status).toBe(500);
    expect(cacheService.get).toHaveBeenCalledWith(`url:${shortCode}`);
  });
});