import { describe, it, expect, vi, beforeEach } from 'vitest';
import { register, Counter, Gauge, Histogram } from 'prom-client';
import { metricsMiddleware, errorMetricsMiddleware } from '../middleware/metricsMiddleware';
import { recordDatabaseConnections, recordQueryDuration, createQueryMetricsWrapper } from '../database-metrics';
import express from 'express';
import request from 'supertest';

// Mock the metrics for testing
vi.mock('prom-client', () => {
  const mockCounter = {
    inc: vi.fn(),
  };
  
  const mockGauge = {
    set: vi.fn(),
  };
  
  const mockHistogram = {
    observe: vi.fn(),
  };
  
  return {
    register: {
      clear: vi.fn(),
      metrics: vi.fn().mockResolvedValue('mock metrics'),
      contentType: 'text/plain',
    },
    Counter: vi.fn().mockImplementation(() => mockCounter),
    Gauge: vi.fn().mockImplementation(() => mockGauge),
    Histogram: vi.fn().mockImplementation(() => mockHistogram),
    collectDefaultMetrics: vi.fn(),
  };
});

// Import metrics after mocking
import { 
  urlsCreatedTotal, 
  redirectsTotal, 
  activeUsersGauge, 
  httpRequestDuration,
  databaseConnectionsActive,
  cacheHitRatio,
  cacheOperations,
  queueMessagesProcessed,
  databaseQueryDuration
} from '../metrics';

// Mock Express app for testing middleware
function createMockApp() {
  const app = express();
  app.use(metricsMiddleware({ serviceName: 'test-service' }));
  
  app.get('/test', (req, res) => {
    res.status(200).json({ success: true });
  });
  
  app.get('/error', (req, res) => {
    res.status(500).json({ error: 'Test error' });
  });
  
  app.use(errorMetricsMiddleware('test-service'));
  
  return app;
}

describe('Metrics', () => {
  beforeEach(() => {
    // Clear all metrics before each test
    register.clear();
    vi.clearAllMocks();
  });
  
  describe('Business Metrics', () => {
    it('should increment urlsCreatedTotal counter', () => {
      urlsCreatedTotal.inc({ user_id: 'test-user', service: 'test-service' });
      
      expect(urlsCreatedTotal.inc).toHaveBeenCalledWith({ 
        user_id: 'test-user', 
        service: 'test-service' 
      });
    });
    
    it('should increment redirectsTotal counter', () => {
      redirectsTotal.inc({ short_code: 'abc123', status: 'success', service: 'test-service' });
      
      expect(redirectsTotal.inc).toHaveBeenCalledWith({ 
        short_code: 'abc123', 
        status: 'success', 
        service: 'test-service' 
      });
    });
    
    it('should set activeUsersGauge value', () => {
      activeUsersGauge.set({ service: 'test-service' }, 42);
      
      expect(activeUsersGauge.set).toHaveBeenCalledWith({ service: 'test-service' }, 42);
    });
  });
  
  describe('Technical Metrics', () => {
    it('should observe httpRequestDuration', () => {
      httpRequestDuration.observe(
        { method: 'GET', route: '/test', status_code: '200', service: 'test-service' },
        0.123
      );
      
      expect(httpRequestDuration.observe).toHaveBeenCalledWith(
        { method: 'GET', route: '/test', status_code: '200', service: 'test-service' },
        0.123
      );
    });
    
    it('should set databaseConnectionsActive value', () => {
      databaseConnectionsActive.set({ database: 'postgresql', service: 'test-service' }, 5);
      
      expect(databaseConnectionsActive.set).toHaveBeenCalledWith(
        { database: 'postgresql', service: 'test-service' }, 
        5
      );
    });
    
    it('should set cacheHitRatio value', () => {
      cacheHitRatio.set({ cache_type: 'redis', service: 'test-service' }, 0.75);
      
      expect(cacheHitRatio.set).toHaveBeenCalledWith(
        { cache_type: 'redis', service: 'test-service' }, 
        0.75
      );
    });
    
    it('should increment cacheOperations counter', () => {
      cacheOperations.inc({ operation: 'get', result: 'hit', service: 'test-service' });
      
      expect(cacheOperations.inc).toHaveBeenCalledWith({ 
        operation: 'get', 
        result: 'hit', 
        service: 'test-service' 
      });
    });
    
    it('should increment queueMessagesProcessed counter', () => {
      queueMessagesProcessed.inc({ queue: 'clicks', status: 'success', service: 'test-service' });
      
      expect(queueMessagesProcessed.inc).toHaveBeenCalledWith({ 
        queue: 'clicks', 
        status: 'success', 
        service: 'test-service' 
      });
    });
    
    it('should observe databaseQueryDuration', () => {
      databaseQueryDuration.observe(
        { query_type: 'select', database: 'postgresql', service: 'test-service' },
        0.05
      );
      
      expect(databaseQueryDuration.observe).toHaveBeenCalledWith(
        { query_type: 'select', database: 'postgresql', service: 'test-service' },
        0.05
      );
    });
  });
  
  describe('Database Metrics', () => {
    it('should record database connections', () => {
      recordDatabaseConnections(
        { serviceName: 'test-service', databaseType: 'postgresql' },
        10
      );
      
      expect(databaseConnectionsActive.set).toHaveBeenCalledWith(
        { database: 'postgresql', service: 'test-service' },
        10
      );
    });
    
    it('should record query duration', () => {
      recordQueryDuration(
        { serviceName: 'test-service', databaseType: 'postgresql' },
        'select',
        100
      );
      
      expect(databaseQueryDuration.observe).toHaveBeenCalledWith(
        { query_type: 'select', database: 'postgresql', service: 'test-service' },
        0.1 // 100ms converted to seconds
      );
    });
    
    it('should wrap query functions with metrics', async () => {
      const metricsWrapper = createQueryMetricsWrapper({
        serviceName: 'test-service',
        databaseType: 'postgresql'
      });
      
      const mockQueryFn = vi.fn().mockResolvedValue({ rows: [{ id: 1 }] });
      
      const result = await metricsWrapper('select', mockQueryFn);
      
      expect(mockQueryFn).toHaveBeenCalled();
      expect(result).toEqual({ rows: [{ id: 1 }] });
      expect(databaseQueryDuration.observe).toHaveBeenCalled();
    });
    
    it('should handle errors in wrapped queries', async () => {
      const metricsWrapper = createQueryMetricsWrapper({
        serviceName: 'test-service',
        databaseType: 'postgresql'
      });
      
      const mockError = new Error('Query failed');
      const mockQueryFn = vi.fn().mockRejectedValue(mockError);
      
      await expect(metricsWrapper('select', mockQueryFn)).rejects.toThrow(mockError);
      expect(databaseQueryDuration.observe).toHaveBeenCalled();
    });
  });
  
  describe('Metrics Middleware', () => {
    it('should record request metrics', async () => {
      const app = createMockApp();
      
      await request(app).get('/test');
      
      // Verify that httpRequestDuration.observe was called with the correct parameters
      expect(httpRequestDuration.observe).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          route: '/test',
          status_code: '200',
          service: 'test-service'
        }),
        expect.any(Number)
      );
    });
    
    it('should record error metrics', async () => {
      const app = createMockApp();
      
      await request(app).get('/error');
      
      // Verify that httpRequestDuration.observe was called with the correct parameters
      expect(httpRequestDuration.observe).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          route: '/error',
          status_code: '500',
          service: 'test-service'
        }),
        expect.any(Number)
      );
    });
  });
});