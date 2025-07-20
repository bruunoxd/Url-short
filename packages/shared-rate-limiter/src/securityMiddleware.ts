import { Request, Response, NextFunction } from 'express';
import { sanitizeHtml, sanitizeUrl } from './sanitizer';
import cors from 'cors';

// Extend Express Request type to include user and startTime properties
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        permissions: string[];
      };
      startTime?: number;
    }
  }
}

/**
 * Middleware to sanitize request body, query parameters, and URL parameters
 * to prevent XSS attacks and other injection vulnerabilities
 */
export const sanitizeInputMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Sanitize request body
      if (req.body && typeof req.body === 'object') {
        sanitizeObject(req.body);
      }
      
      // Sanitize query parameters
      if (req.query && typeof req.query === 'object') {
        sanitizeObject(req.query);
      }
      
      // Sanitize URL parameters
      if (req.params && typeof req.params === 'object') {
        sanitizeObject(req.params);
      }
      
      next();
    } catch (error) {
      console.error('Error sanitizing input:', error);
      next();
    }
  };
};

/**
 * Recursively sanitize all string values in an object
 */
function sanitizeObject(obj: Record<string, any>): void {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      
      if (typeof value === 'string') {
        // Sanitize string values
        obj[key] = sanitizeHtml(value);
        
        // Additional URL sanitization for fields that might contain URLs
        if (key.toLowerCase().includes('url') || 
            key.toLowerCase().includes('link') || 
            key.toLowerCase().includes('website') || 
            value.match(/^https?:\/\//i) ||
            value.match(/^javascript:/i)) {
          obj[key] = sanitizeUrl(value);
        }
      } else if (value !== null && typeof value === 'object') {
        // Recursively sanitize nested objects
        sanitizeObject(value);
      }
    }
  }
}

/**
 * Middleware to add security headers to responses
 */
export const securityHeadersMiddleware = (options: {
  hsts?: boolean;
  contentSecurityPolicy?: boolean;
  xssProtection?: boolean;
  noSniff?: boolean;
  frameOptions?: boolean;
  referrerPolicy?: boolean;
} = {}) => {
  const {
    hsts = true,
    contentSecurityPolicy = true,
    xssProtection = true,
    noSniff = true,
    frameOptions = true,
    referrerPolicy = true
  } = options;
  
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // HTTP Strict Transport Security
      if (hsts) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      }
      
      // Content Security Policy
      if (contentSecurityPolicy) {
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'"
        );
      }
      
      // X-XSS-Protection
      if (xssProtection) {
        res.setHeader('X-XSS-Protection', '1; mode=block');
      }
      
      // X-Content-Type-Options
      if (noSniff) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      }
      
      // X-Frame-Options
      if (frameOptions) {
        res.setHeader('X-Frame-Options', 'DENY');
      }
      
      // Referrer-Policy
      if (referrerPolicy) {
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      }
      
      next();
    } catch (error) {
      console.error('Error setting security headers:', error);
      next();
    }
  };
};

/**
 * CORS middleware configuration
 * @param options CORS configuration options
 */
export const corsMiddleware = (options: cors.CorsOptions = {}) => {
  const defaultOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl requests)
      if (!origin) {
        return callback(null, true);
      }
      
      // List of allowed origins (can be moved to environment variables)
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:8080',
        'https://url-shortener.example.com'
      ];
      
      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('CORS not allowed'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    credentials: true,
    maxAge: 86400 // 24 hours
  };
  
  // Merge default options with provided options
  const mergedOptions = { ...defaultOptions, ...options };
  
  return cors(mergedOptions);
};

/**
 * Middleware to log requests with sensitive data filtering
 */
export const requestLoggerMiddleware = (options: {
  sensitiveFields?: string[];
  logBody?: boolean;
  logHeaders?: boolean;
  logQuery?: boolean;
} = {}) => {
  const {
    sensitiveFields = ['password', 'token', 'secret', 'authorization', 'apiKey', 'credit_card', 'ssn'],
    logBody = true,
    logHeaders = true,
    logQuery = true
  } = options;
  
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Add request start time for performance tracking
      req.startTime = Date.now();
      
      // Create a log object with basic request info
      const logData: Record<string, any> = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl || req.url,
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
      };
      
      // Add request ID if available
      if (req.headers['x-request-id']) {
        logData.requestId = req.headers['x-request-id'];
      }
      
      // Add authenticated user ID if available
      if (req.user?.userId) {
        logData.userId = req.user.userId;
      }
      
      // Add query parameters if enabled
      if (logQuery && Object.keys(req.query).length > 0) {
        logData.query = filterSensitiveData(req.query, sensitiveFields);
      }
      
      // Add request headers if enabled
      if (logHeaders) {
        logData.headers = filterSensitiveData(req.headers, sensitiveFields);
      }
      
      // Add request body if enabled
      if (logBody && req.body && Object.keys(req.body).length > 0) {
        logData.body = filterSensitiveData(req.body, sensitiveFields);
      }
      
      // Log the request
      console.log(`[REQUEST] ${req.method} ${req.originalUrl || req.url}`, logData);
      
      // Capture response data
      const originalSend = res.send;
      res.send = function(body) {
        // Log response status code
        console.log(`[RESPONSE] ${req.method} ${req.originalUrl || req.url}`, {
          statusCode: res.statusCode,
          responseTime: Date.now() - (req.startTime || Date.now()),
          contentLength: body ? body.length : 0
        });
        
        return originalSend.call(this, body);
      };
      
      next();
    } catch (error) {
      console.error('Error in request logger middleware:', error);
      next();
    }
  };
};

/**
 * Filter sensitive data from an object
 */
function filterSensitiveData(data: Record<string, any>, sensitiveFields: string[]): Record<string, any> {
  const filtered: Record<string, any> = {};
  
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = data[key];
      
      // Check if this is a sensitive field
      const isSensitive = sensitiveFields.some(field => 
        key.toLowerCase().includes(field.toLowerCase())
      );
      
      if (isSensitive) {
        // Mask sensitive data
        filtered[key] = '[REDACTED]';
      } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively filter nested objects
        filtered[key] = filterSensitiveData(value, sensitiveFields);
      } else {
        // Keep non-sensitive data as is
        filtered[key] = value;
      }
    }
  }
  
  return filtered;
}