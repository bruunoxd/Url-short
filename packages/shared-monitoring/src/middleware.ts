import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ApiVersion, ApiResponse, ApiErrorCode } from '@url-shortener/shared-types';
import { httpRequestDuration } from './metrics';
import pino from 'pino';
import pinoHttp from 'pino-http';
import path from 'path';
import fs from 'fs';

// Export metrics middleware
export * from './middleware/metricsMiddleware';

// Create a logger instance
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * API Response standardization middleware
 * Ensures all API responses follow a consistent format
 * 
 * @param apiVersion Default API version to use
 * @returns Express middleware
 */
export function apiResponseMiddleware(apiVersion: ApiVersion = ApiVersion.V1) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store the original res.json method
    const originalJson = res.json;
    const requestId = req.headers['x-request-id'] as string || uuidv4();
    
    // Override res.json method to standardize API responses
    res.json = function(body: any): Response {
      // Don't wrap if already wrapped or if it's a non-API route
      if (body && (body.meta?.apiVersion || !req.path.startsWith('/api'))) {
        return originalJson.call(this, body);
      }
      
      // Create standardized response
      const apiResponse: ApiResponse = {
        success: res.statusCode < 400,
        data: res.statusCode < 400 ? body : undefined,
        error: res.statusCode >= 400 ? {
          code: body.code || mapStatusToErrorCode(res.statusCode),
          message: body.message || body.error || getDefaultErrorMessage(res.statusCode),
          details: body.details || undefined,
        } : undefined,
        meta: {
          apiVersion: req.apiVersion || apiVersion,
          requestId,
          timestamp: new Date().toISOString(),
        },
      };
      
      return originalJson.call(this, apiResponse);
    };
    
    // Add requestId to headers
    res.setHeader('X-Request-ID', requestId);
    
    next();
  };
}

/**
 * Maps HTTP status codes to API error codes
 * 
 * @param statusCode HTTP status code
 * @returns API error code
 */
function mapStatusToErrorCode(statusCode: number): ApiErrorCode {
  switch (statusCode) {
    case 400:
      return ApiErrorCode.BAD_REQUEST;
    case 401:
      return ApiErrorCode.UNAUTHORIZED;
    case 403:
      return ApiErrorCode.FORBIDDEN;
    case 404:
      return ApiErrorCode.NOT_FOUND;
    case 409:
      return ApiErrorCode.CONFLICT;
    case 422:
      return ApiErrorCode.VALIDATION_ERROR;
    case 429:
      return ApiErrorCode.RATE_LIMIT_EXCEEDED;
    default:
      return ApiErrorCode.INTERNAL_SERVER_ERROR;
  }
}

/**
 * Gets a default error message for HTTP status codes
 * 
 * @param statusCode HTTP status code
 * @returns Default error message
 */
function getDefaultErrorMessage(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'Bad request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Resource not found';
    case 409:
      return 'Resource conflict';
    case 422:
      return 'Validation error';
    case 429:
      return 'Rate limit exceeded';
    default:
      return 'Internal server error';
  }
}

/**
 * API versioning middleware
 * Extracts API version from URL or headers and makes it available in the request object
 * 
 * @param options Configuration options
 * @returns Express middleware
 */
export function apiVersioningMiddleware(options: {
  defaultVersion?: ApiVersion;
  supportedVersions?: ApiVersion[];
  deprecatedVersions?: ApiVersion[];
} = {}) {
  const {
    defaultVersion = ApiVersion.V1,
    supportedVersions = Object.values(ApiVersion),
    deprecatedVersions = [],
  } = options;
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Try to extract version from different sources in order of priority:
    // 1. URL path (/api/v1/resource)
    // 2. Accept header (Accept: application/vnd.url-shortener.v1+json)
    // 3. X-API-Version header (X-API-Version: v1)
    // 4. Default version
    
    let detectedVersion: ApiVersion | undefined;
    
    // 1. Check URL path
    const urlParts = req.path.split('/');
    const versionIndex = urlParts.findIndex(part => part.match(/^v\d+$/i));
    
    if (versionIndex !== -1) {
      const version = urlParts[versionIndex].toLowerCase() as ApiVersion;
      if (supportedVersions.includes(version)) {
        detectedVersion = version;
      }
    }
    
    // 2. Check Accept header
    if (!detectedVersion) {
      const acceptHeader = req.headers.accept;
      if (acceptHeader) {
        const versionMatch = acceptHeader.match(/application\/vnd\.url-shortener\.(v\d+)\+json/i);
        if (versionMatch && versionMatch[1]) {
          const version = versionMatch[1].toLowerCase() as ApiVersion;
          if (supportedVersions.includes(version)) {
            detectedVersion = version;
          }
        }
      }
    }
    
    // 3. Check X-API-Version header
    if (!detectedVersion) {
      const versionHeader = req.headers['x-api-version'];
      if (versionHeader && typeof versionHeader === 'string') {
        const versionMatch = versionHeader.match(/^v\d+$/i);
        if (versionMatch) {
          const version = versionHeader.toLowerCase() as ApiVersion;
          if (supportedVersions.includes(version)) {
            detectedVersion = version;
          }
        }
      }
    }
    
    // 4. Use default version
    if (!detectedVersion) {
      detectedVersion = defaultVersion;
    }
    
    // Set API version in request
    req.apiVersion = detectedVersion;
    
    // Add version to response headers
    res.setHeader('X-API-Version', detectedVersion);
    
    // Add deprecation warning header if applicable
    if (deprecatedVersions.includes(detectedVersion)) {
      res.setHeader('Warning', '299 - "This API version is deprecated and will be removed in the future"');
      res.setHeader('Sunset', new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toUTCString()); // 6 months from now
    }
    
    next();
  };
}

/**
 * Request logging middleware
 * Logs request and response details
 * 
 * @param options Configuration options
 * @returns Express middleware
 */
export function requestLoggingMiddleware(options: {
  logBody?: boolean;
  logHeaders?: boolean;
  sensitiveFields?: string[];
  serviceName?: string;
  logLevel?: string;
}) {
  const {
    logBody = false,
    logHeaders = false,
    sensitiveFields = ['password', 'token', 'authorization', 'apiKey', 'secret'],
    serviceName = 'api',
    logLevel = 'info',
  } = options;
  
  // Create a Pino HTTP logger
  const httpLogger = pinoHttp({
    logger,
    level: logLevel,
    customLogLevel: (req, res, err) => {
      if (res.statusCode >= 500 || err) {
        return 'error';
      } else if (res.statusCode >= 400) {
        return 'warn';
      }
      return 'info';
    },
    customSuccessMessage: (req, res) => {
      return `${req.method} ${req.url} ${res.statusCode}`;
    },
    customErrorMessage: (req, res, err) => {
      return `${req.method} ${req.url} ${res.statusCode}: ${err.message}`;
    },
    customProps: (req, res) => {
      return {
        service: serviceName,
        requestId: req.headers['x-request-id'] || uuidv4(),
        apiVersion: req.apiVersion,
      };
    },
    serializers: {
      req: (req) => {
        const serialized: any = {
          method: req.method,
          url: req.url,
          query: req.query,
        };
        
        // Add headers if enabled
        if (logHeaders) {
          serialized.headers = { ...req.headers };
          
          // Mask sensitive headers
          sensitiveFields.forEach(field => {
            const lowerField = field.toLowerCase();
            Object.keys(serialized.headers).forEach(header => {
              if (header.toLowerCase().includes(lowerField)) {
                serialized.headers[header] = '******';
              }
            });
          });
        }
        
        // Add body if enabled
        if (logBody && req.body) {
          serialized.body = { ...req.body };
          
          // Mask sensitive fields in body
          sensitiveFields.forEach(field => {
            maskSensitiveData(serialized.body, field);
          });
        }
        
        return serialized;
      },
      res: (res) => {
        return {
          statusCode: res.statusCode,
          responseTime: res.responseTime,
        };
      },
    },
    autoLogging: true,
    redact: {
      paths: sensitiveFields.map(field => `req.body.${field}`),
      censor: '******',
    },
  });
  
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    req.startTime = startTime;
    
    // Use Pino HTTP logger
    httpLogger(req, res);
    
    // Record metrics
    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      
      httpRequestDuration.observe(
        { 
          method: req.method, 
          route: req.route?.path || 'unknown', 
          status_code: res.statusCode.toString(),
          service: serviceName,
          version: req.apiVersion || 'unknown',
        },
        responseTime / 1000
      );
    });
    
    next();
  };
}

/**
 * Recursively masks sensitive data in an object
 * 
 * @param obj Object to mask
 * @param sensitiveField Field name to mask
 */
function maskSensitiveData(obj: any, sensitiveField: string): void {
  if (!obj || typeof obj !== 'object') return;
  
  Object.keys(obj).forEach(key => {
    if (key.toLowerCase().includes(sensitiveField.toLowerCase())) {
      obj[key] = '******';
    } else if (typeof obj[key] === 'object') {
      maskSensitiveData(obj[key], sensitiveField);
    }
  });
}

/**
 * API contract validation middleware
 * Validates request and response against OpenAPI schema
 * 
 * @param options Configuration options
 * @returns Express middleware
 */
export function apiContractValidationMiddleware(options: {
  validateRequest?: boolean;
  validateResponse?: boolean;
  openApiSpec: any;
}) {
  const {
    validateRequest = true,
    validateResponse = false,
    openApiSpec,
  } = options;
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Implementation would use a library like openapi-validator
    // This is a placeholder for the actual implementation
    
    // For now, just pass through
    next();
  };
}

/**
 * Enhanced API response middleware with versioning support
 * Ensures all API responses follow a consistent format and include version information
 * 
 * @param options Configuration options
 * @returns Express middleware
 */
export function enhancedApiResponseMiddleware(options: {
  defaultVersion?: ApiVersion;
  includeRequestId?: boolean;
  includeTimestamp?: boolean;
  includeResponseTime?: boolean;
} = {}) {
  const {
    defaultVersion = ApiVersion.V1,
    includeRequestId = true,
    includeTimestamp = true,
    includeResponseTime = true,
  } = options;
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Store the original res.json method
    const originalJson = res.json;
    const requestId = req.headers['x-request-id'] as string || uuidv4();
    const startTime = Date.now();
    
    // Add requestId to headers if enabled
    if (includeRequestId) {
      res.setHeader('X-Request-ID', requestId);
    }
    
    // Override res.json method to standardize API responses
    res.json = function(body: any): Response {
      // Don't wrap if already wrapped or if it's a non-API route
      if (body && (body.meta?.apiVersion || !req.path.startsWith('/api'))) {
        return originalJson.call(this, body);
      }
      
      // Create meta object with version information
      const meta: Record<string, any> = {
        apiVersion: req.apiVersion || defaultVersion,
      };
      
      // Add requestId to meta if enabled
      if (includeRequestId) {
        meta.requestId = requestId;
      }
      
      // Add timestamp to meta if enabled
      if (includeTimestamp) {
        meta.timestamp = new Date().toISOString();
      }
      
      // Add response time to meta if enabled
      if (includeResponseTime) {
        meta.responseTime = `${Date.now() - startTime}ms`;
      }
      
      // Create standardized response
      const apiResponse: ApiResponse = {
        success: res.statusCode < 400,
        data: res.statusCode < 400 ? body : undefined,
        error: res.statusCode >= 400 ? {
          code: body.code || mapStatusToErrorCode(res.statusCode),
          message: body.message || body.error || getDefaultErrorMessage(res.statusCode),
          details: body.details || undefined,
        } : undefined,
        meta,
      };
      
      return originalJson.call(this, apiResponse);
    };
    
    next();
  };
}

/**
 * API documentation middleware
 * Serves OpenAPI documentation for the API
 * 
 * @param options Configuration options
 * @returns Express middleware
 */
export function apiDocumentationMiddleware(options: {
  docsPath?: string;
  specPath?: string;
  uiOptions?: Record<string, any>;
}) {
  const {
    docsPath = '/api-docs',
    specPath = '/api-docs/spec',
    uiOptions = {},
  } = options;
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Check if request is for API documentation
    if (req.path === docsPath) {
      // Serve Swagger UI HTML
      res.setHeader('Content-Type', 'text/html');
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>API Documentation</title>
          <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@4/swagger-ui.css">
          <style>
            body { margin: 0; padding: 0; }
            .swagger-ui .topbar { display: none; }
          </style>
        </head>
        <body>
          <div id="swagger-ui"></div>
          <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@4/swagger-ui-bundle.js"></script>
          <script>
            window.onload = function() {
              const ui = SwaggerUIBundle({
                url: "${specPath}",
                dom_id: "#swagger-ui",
                deepLinking: true,
                presets: [
                  SwaggerUIBundle.presets.apis,
                  SwaggerUIBundle.SwaggerUIStandalonePreset
                ],
                layout: "BaseLayout",
                ...${JSON.stringify(uiOptions)}
              });
              window.ui = ui;
            }
          </script>
        </body>
        </html>
      `);
      return;
    }
    
    // Check if request is for OpenAPI spec
    if (req.path === specPath) {
      // Get API version from query parameter or default to v1
      const version = (req.query.version as string || 'v1').toLowerCase() as ApiVersion;
      
      try {
        // Try to load OpenAPI spec for requested version
        const specPath = path.join(process.cwd(), 'api-docs', `${version}.json`);
        const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
        
        res.json(spec);
      } catch (error) {
        res.status(404).json({
          error: `API specification for version ${version} not found`,
        });
      }
      
      return;
    }
    
    next();
  };
}

// Declare module augmentation for Express Request
declare global {
  namespace Express {
    interface Request {
      apiVersion?: ApiVersion;
      startTime?: number;
      id?: string;
    }
  }
}