import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { UrlService } from '../services/urlService';
import { ShortUrlEntity } from '@url-shortener/shared-db';
import { CreateUrlSchema, UpdateUrlSchema } from '@url-shortener/shared-types';

// Mock dependencies
vi.mock('../services/urlService');
vi.mock('@url-shortener/shared-db');
vi.mock('@url-shortener/shared-monitoring', () => ({
  metricsMiddleware: () => (req: any, res: any, next: any) => next(),
  errorMetricsMiddleware: () => (err: any, req: any, res: any, next: any) => next(err),
  urlsCreatedTotal: { inc: vi.fn() },
  redirectsTotal: { inc: vi.fn() },
  httpRequestDuration: { observe: vi.fn() },
  HealthMonitor: class {
    addCheck = vi.fn();
    getHealthEndpoint = vi.fn().mockReturnValue((req: any, res: any) => res.json({ status: 'healthy' }));
  },
  createDatabaseHealthChecker: vi.fn(),
  createRedisHealthChecker: vi.fn(),
  createExternalServiceHealthChecker: vi.fn(),
}));

// Mock services
const mockUrlService = {
  createShortUrl: vi.fn(),
  getShortUrl: vi.fn(),
  updateShortUrl: vi.fn(),
  deleteShortUrl: vi.fn(),
  listUserShortUrls: vi.fn(),
};

// Setup test app
const setupTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock URL service
  (UrlService as any).mockImplementation(() => mockUrlService);
  
  // Import routes (this will use the mocked services)
  const routes = require('../index');
  
  return app;
};

describe('URL Management API', () => {
  let app: express.Application;
  
  beforeAll(() => {
    app = setupTestApp();
  });
  
  afterAll(() => {
    vi.clearAllMocks();
  });
  
  describe('POST /api/v1/urls', () => {
    it('should create a short URL', async () => {
      // Setup
      const createUrlData = {
        originalUrl: 'https://example.com/very/long/url',
        title: 'Example URL',
        tags: ['example', 'test']
      };
      
      const createdUrl = {
        id: '123',
        userId: 'user123',
        originalUrl: 'https://example.com/very/long/url',
        shortCode: 'abc123',
        shortUrl: 'https://short.ly/abc123',
        title: 'Example URL',
        tags: ['example', 'test'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      mockUrlService.createShortUrl.mockResolvedValue(createdUrl);
      
      // Execute
      const response = await request(app)
        .post('/api/v1/urls')
        .set('x-user-id', 'user123')
        .send(createUrlData);
      
      // Verify
      expect(response.status).toBe(201);
      expect(response.body).toEqual(createdUrl);
      expect(mockUrlService.createShortUrl).toHaveBeenCalledWith('user123', createUrlData);
    });
    
    it('should return 400 for invalid URL', async () => {
      // Setup
      const invalidData = {
        originalUrl: 'not-a-url',
        title: 'Invalid URL'
      };
      
      mockUrlService.createShortUrl.mockRejectedValue(new Error('Invalid URL'));
      
      // Execute
      const response = await request(app)
        .post('/api/v1/urls')
        .set('x-user-id', 'user123')
        .send(invalidData);
      
      // Verify
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid URL');
    });
  });
  
  describe('GET /api/v1/urls', () => {
    it('should list user URLs with pagination', async () => {
      // Setup
      const urls = [
        {
          id: '123',
          userId: 'user123',
          originalUrl: 'https://example.com/1',
          shortCode: 'abc123',
          shortUrl: 'https://short.ly/abc123',
          title: 'Example 1',
          tags: ['example'],
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: '456',
          userId: 'user123',
          originalUrl: 'https://example.com/2',
          shortCode: 'def456',
          shortUrl: 'https://short.ly/def456',
          title: 'Example 2',
          tags: ['example'],
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];
      
      mockUrlService.listUserShortUrls.mockResolvedValue({
        urls,
        total: 2
      });
      
      // Execute
      const response = await request(app)
        .get('/api/v1/urls')
        .set('x-user-id', 'user123')
        .query({ page: 1, limit: 10 });
      
      // Verify
      expect(response.status).toBe(200);
      expect(response.body.urls).toEqual(urls);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1
      });
    });
  });
  
  describe('PUT /api/v1/urls/:id', () => {
    it('should update a short URL', async () => {
      // Setup
      const urlId = '123';
      const updateData = {
        title: 'Updated Title',
        tags: ['updated', 'test'],
        isActive: true
      };
      
      const updatedUrl = {
        id: urlId,
        userId: 'user123',
        originalUrl: 'https://example.com/very/long/url',
        shortCode: 'abc123',
        shortUrl: 'https://short.ly/abc123',
        title: 'Updated Title',
        tags: ['updated', 'test'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      mockUrlService.updateShortUrl.mockResolvedValue(updatedUrl);
      
      // Execute
      const response = await request(app)
        .put(`/api/v1/urls/${urlId}`)
        .set('x-user-id', 'user123')
        .send(updateData);
      
      // Verify
      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedUrl);
      expect(mockUrlService.updateShortUrl).toHaveBeenCalledWith(urlId, 'user123', updateData);
    });
    
    it('should return 404 for non-existent URL', async () => {
      // Setup
      const urlId = 'nonexistent';
      const updateData = {
        title: 'Updated Title'
      };
      
      mockUrlService.updateShortUrl.mockRejectedValue(new Error('Short URL not found'));
      
      // Execute
      const response = await request(app)
        .put(`/api/v1/urls/${urlId}`)
        .set('x-user-id', 'user123')
        .send(updateData);
      
      // Verify
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });
  });
  
  describe('DELETE /api/v1/urls/:id', () => {
    it('should delete a short URL', async () => {
      // Setup
      const urlId = '123';
      mockUrlService.deleteShortUrl.mockResolvedValue(undefined);
      
      // Execute
      const response = await request(app)
        .delete(`/api/v1/urls/${urlId}`)
        .set('x-user-id', 'user123');
      
      // Verify
      expect(response.status).toBe(204);
      expect(mockUrlService.deleteShortUrl).toHaveBeenCalledWith(urlId, 'user123');
    });
  });
});