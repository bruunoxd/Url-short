import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger, createRequestLogger, createChildLogger, correlationMiddleware } from '../logging';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Mock pino and pino-http
vi.mock('pino', () => {
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockImplementation(() => mockLogger),
  };
  
  const mockPino = vi.fn().mockReturnValue(mockLogger);
  mockPino.stdTimeFunctions = {
    isoTime: vi.fn(),
  };
  mockPino.stdSerializers = {
    err: vi.fn(),
  };
  
  return {
    default: mockPino,
    stdTimeFunctions: mockPino.stdTimeFunctions,
    stdSerializers: mockPino.stdSerializers,
  };
});

vi.mock('pino-http', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      return vi.fn();
    }),
  };
});

vi.mock('uuid', () => {
  return {
    v4: vi.fn().mockReturnValue('mock-uuid'),
  };
});

describe('Logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  describe('createLogger', () => {
    it('should create a logger with default options', () => {
      const logger = createLogger({ serviceName: 'test-service' });
      
      expect(logger).toBeDefined();
    });
    
    it('should create a logger with custom options', () => {
      const options = {
        serviceName: 'test-service',
        level: 'debug',
        prettyPrint: true,
        redactFields: ['password', 'token'],
      };
      
      const logger = createLogger(options);
      
      expect(logger).toBeDefined();
    });
  });
  
  describe('createRequestLogger', () => {
    it('should create a request logger middleware', () => {
      const middleware = createRequestLogger({ serviceName: 'test-service' });
      
      expect(middleware).toBeDefined();
    });
    
    it('should handle requests with the middleware', () => {
      const middleware = createRequestLogger({ serviceName: 'test-service' });
      
      const req = {
        headers: {},
      } as unknown as Request;
      
      const res = {
        setHeader: vi.fn(),
        getHeader: vi.fn(),
      } as unknown as Response;
      
      const next = vi.fn();
      
      middleware(req, res, next);
      
      expect(req.headers['x-request-id']).toBe('mock-uuid');
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'mock-uuid');
      expect(next).toHaveBeenCalled();
    });
    
    it('should use existing request ID if present', () => {
      const middleware = createRequestLogger({ serviceName: 'test-service' });
      
      const req = {
        headers: {
          'x-request-id': 'existing-id',
        },
      } as unknown as Request;
      
      const res = {
        setHeader: vi.fn(),
        getHeader: vi.fn(),
      } as unknown as Response;
      
      const next = vi.fn();
      
      middleware(req, res, next);
      
      expect(req.headers['x-request-id']).toBe('existing-id');
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'existing-id');
      expect(next).toHaveBeenCalled();
    });
    
    it('should intercept response body when logResponseBody is true', () => {
      const middleware = createRequestLogger({ 
        serviceName: 'test-service',
        logResponseBody: true,
      });
      
      const req = {
        headers: {},
      } as unknown as Request;
      
      const originalSend = vi.fn().mockReturnThis();
      const res = {
        setHeader: vi.fn(),
        getHeader: vi.fn(),
        send: originalSend,
      } as unknown as Response;
      
      const next = vi.fn();
      
      middleware(req, res, next);
      
      expect(res.send).not.toBe(originalSend);
      
      // Test the intercepted send method
      const body = { test: 'data' };
      res.send(body);
      
      expect((res as any).body).toBe(body);
    });
  });
  
  describe('createChildLogger', () => {
    it('should create a child logger with additional context', () => {
      const parentLogger = createLogger({ serviceName: 'test-service' });
      const context = { requestId: 'test-id', userId: 'user-123' };
      
      const childLogger = createChildLogger(parentLogger, context);
      
      expect(childLogger).toBeDefined();
      expect(parentLogger.child).toHaveBeenCalledWith(context);
    });
  });
  
  describe('correlationMiddleware', () => {
    it('should add correlation IDs to the request', () => {
      const middleware = correlationMiddleware();
      
      const req = {
        headers: {},
      } as unknown as Request;
      
      const res = {
        setHeader: vi.fn(),
      } as unknown as Response;
      
      const next = vi.fn();
      
      middleware(req, res, next);
      
      expect(req.headers['x-request-id']).toBe('mock-uuid');
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'mock-uuid');
      expect((req as any).id).toBe('mock-uuid');
      expect(next).toHaveBeenCalled();
    });
    
    it('should use existing request ID if present', () => {
      const middleware = correlationMiddleware();
      
      const req = {
        headers: {
          'x-request-id': 'existing-id',
        },
      } as unknown as Request;
      
      const res = {
        setHeader: vi.fn(),
      } as unknown as Response;
      
      const next = vi.fn();
      
      middleware(req, res, next);
      
      expect(req.headers['x-request-id']).toBe('existing-id');
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'existing-id');
      expect((req as any).id).toBe('existing-id');
      expect(next).toHaveBeenCalled();
    });
  });
});