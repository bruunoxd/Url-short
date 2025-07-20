import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';
import { 
  sanitizeInputMiddleware, 
  securityHeadersMiddleware, 
  corsMiddleware, 
  requestLoggerMiddleware 
} from '../src/securityMiddleware';
import { sanitizeHtml, sanitizeUrl } from '../src/sanitizer';

// Mock console.log and console.error to avoid cluttering test output
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('Security Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: vi.Mock;
  
  beforeEach(() => {
    mockRequest = {
      body: {},
      query: {},
      params: {},
      headers: {},
      ip: '127.0.0.1',
      originalUrl: '/test',
      method: 'GET',
      socket: {
        remoteAddress: '127.0.0.1'
      } as any
    };
    
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      send: vi.fn().mockReturnThis()
    };
    
    nextFunction = vi.fn();
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('sanitizeInputMiddleware', () => {
    it('should sanitize request body', async () => {
      mockRequest.body = {
        name: '<script>alert("XSS")</script>',
        url: 'javascript:alert("XSS")',
        description: 'Normal text'
      };
      
      const middleware = sanitizeInputMiddleware();
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);
      
      expect(mockRequest.body.name).toBe(sanitizeHtml('<script>alert("XSS")</script>'));
      expect(mockRequest.body.url).toBe(sanitizeUrl('javascript:alert("XSS")'));
      expect(mockRequest.body.description).toBe('Normal text');
      expect(nextFunction).toHaveBeenCalled();
    });
    
    it('should sanitize query parameters', async () => {
      mockRequest.query = {
        search: '<img src="x" onerror="alert(1)">',
        sort: 'normal'
      };
      
      const middleware = sanitizeInputMiddleware();
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);
      
      expect(mockRequest.query.search).toBe(sanitizeHtml('<img src="x" onerror="alert(1)">'));
      expect(mockRequest.query.sort).toBe('normal');
      expect(nextFunction).toHaveBeenCalled();
    });
    
    it('should sanitize URL parameters', async () => {
      mockRequest.params = {
        id: '<script>alert("XSS")</script>',
        slug: 'normal-slug'
      };
      
      const middleware = sanitizeInputMiddleware();
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);
      
      expect(mockRequest.params.id).toBe(sanitizeHtml('<script>alert("XSS")</script>'));
      expect(mockRequest.params.slug).toBe('normal-slug');
      expect(nextFunction).toHaveBeenCalled();
    });
    
    it('should handle nested objects', async () => {
      mockRequest.body = {
        user: {
          name: '<script>alert("XSS")</script>',
          profile: {
            website: 'javascript:alert("XSS")'
          }
        }
      };
      
      const middleware = sanitizeInputMiddleware();
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);
      
      // We need to manually apply the sanitization functions to match what the middleware does
      const expectedName = sanitizeHtml('<script>alert("XSS")</script>');
      const expectedWebsite = sanitizeUrl('javascript:alert("XSS")');
      
      expect(mockRequest.body.user.name).toBe(expectedName);
      expect(mockRequest.body.user.profile.website).toBe(expectedWebsite);
      expect(nextFunction).toHaveBeenCalled();
    });
    
    it('should continue if an error occurs during sanitization', async () => {
      // Create a circular reference to cause JSON stringification error
      const circular: any = {};
      circular.self = circular;
      mockRequest.body = { circular };
      
      const middleware = sanitizeInputMiddleware();
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);
      
      expect(nextFunction).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
  });
  
  describe('securityHeadersMiddleware', () => {
    it('should set default security headers', async () => {
      const middleware = securityHeadersMiddleware();
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);
      
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Security-Policy', expect.any(String));
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
      expect(nextFunction).toHaveBeenCalled();
    });
    
    it('should allow disabling specific headers', async () => {
      const middleware = securityHeadersMiddleware({
        hsts: false,
        contentSecurityPolicy: false
      });
      
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);
      
      expect(mockResponse.setHeader).not.toHaveBeenCalledWith('Strict-Transport-Security', expect.any(String));
      expect(mockResponse.setHeader).not.toHaveBeenCalledWith('Content-Security-Policy', expect.any(String));
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(nextFunction).toHaveBeenCalled();
    });
    
    it('should continue if an error occurs', async () => {
      mockResponse.setHeader = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      
      const middleware = securityHeadersMiddleware();
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);
      
      expect(nextFunction).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
  });
  
  describe('requestLoggerMiddleware', () => {
    it('should log basic request information', async () => {
      mockRequest.headers = {
        'user-agent': 'test-agent',
        'x-request-id': 'req-123'
      };
      
      const middleware = requestLoggerMiddleware();
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);
      
      expect(console.log).toHaveBeenCalled();
      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.startTime).toBeDefined();
    });
    
    it('should filter sensitive data', async () => {
      mockRequest.body = {
        username: 'testuser',
        password: 'secret123',
        token: 'jwt-token',
        data: {
          credit_card: '4111111111111111'
        }
      };
      
      mockRequest.headers = {
        'authorization': 'Bearer token',
        'user-agent': 'test-agent'
      };
      
      const middleware = requestLoggerMiddleware();
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);
      
      // Check that console.log was called with filtered data
      const logCall = (console.log as any).mock.calls[0][1];
      
      expect(logCall.body.password).toBe('[REDACTED]');
      expect(logCall.body.token).toBe('[REDACTED]');
      expect(logCall.body.data.credit_card).toBe('[REDACTED]');
      expect(logCall.headers.authorization).toBe('[REDACTED]');
      expect(logCall.headers['user-agent']).toBe('test-agent');
      expect(nextFunction).toHaveBeenCalled();
    });
    
    it('should log response data', async () => {
      const middleware = requestLoggerMiddleware();
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);
      
      // Simulate response being sent
      const body = 'Test response';
      (mockResponse.send as any)(body);
      
      expect(console.log).toHaveBeenCalledTimes(2); // Request and response logs
      expect(nextFunction).toHaveBeenCalled();
    });
    
    it('should handle errors gracefully', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {
        throw new Error('Logging error');
      });
      
      const middleware = requestLoggerMiddleware();
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);
      
      expect(console.error).toHaveBeenCalled();
      expect(nextFunction).toHaveBeenCalled();
    });
  });
  
  describe('corsMiddleware', () => {
    it('should create a CORS middleware with default options', async () => {
      const middleware = corsMiddleware();
      
      // Since cors() returns a function, we can't easily test its behavior directly
      // We're just verifying it doesn't throw an error
      expect(middleware).toBeInstanceOf(Function);
    });
  });
});