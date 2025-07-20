import pino from 'pino';
import pinoHttp from 'pino-http';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Configuration options for the logger
 */
export interface LoggerOptions {
  /**
   * Service name to include in logs
   */
  serviceName: string;
  
  /**
   * Log level (default: 'info')
   */
  level?: string;
  
  /**
   * Whether to pretty print logs (default: false)
   */
  prettyPrint?: boolean;
  
  /**
   * Fields to redact from logs
   */
  redactFields?: string[];
  
  /**
   * Whether to include request body in logs (default: false)
   */
  logRequestBody?: boolean;
  
  /**
   * Whether to include response body in logs (default: false)
   */
  logResponseBody?: boolean;
}

/**
 * Creates a logger instance with the specified options
 * 
 * @param options Configuration options
 * @returns Pino logger instance
 */
export function createLogger(options: LoggerOptions) {
  const {
    serviceName,
    level = process.env.LOG_LEVEL || 'info',
    prettyPrint = process.env.NODE_ENV !== 'production',
    redactFields = ['password', 'token', 'authorization', 'apiKey', 'secret'],
  } = options;
  
  const pinoOptions: pino.LoggerOptions = {
    level,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      service: serviceName,
    },
    redact: {
      paths: redactFields.map(field => `req.body.${field}`),
      censor: '******',
    },
  };
  
  if (prettyPrint) {
    pinoOptions.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  }
  
  return pino(pinoOptions);
}

/**
 * Creates an Express middleware for request logging
 * 
 * @param options Configuration options
 * @returns Express middleware
 */
export function createRequestLogger(options: LoggerOptions) {
  const {
    serviceName,
    level = 'info',
    logRequestBody = false,
    logResponseBody = false,
    redactFields = ['password', 'token', 'authorization', 'apiKey', 'secret'],
  } = options;
  
  const logger = createLogger(options);
  
  const httpLogger = pinoHttp({
    logger,
    level,
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
        requestId: req.headers['x-request-id'] || req.id || uuidv4(),
        traceId: req.headers['x-trace-id'] || res.getHeader('x-trace-id'),
        userId: req.headers['x-user-id'],
        apiVersion: (req as any).apiVersion,
      };
    },
    serializers: {
      req: (req) => {
        const serialized: any = {
          method: req.method,
          url: req.url,
          query: req.query,
        };
        
        // Add headers (redacting sensitive information)
        serialized.headers = { ...req.headers };
        redactFields.forEach(field => {
          const lowerField = field.toLowerCase();
          Object.keys(serialized.headers).forEach(header => {
            if (header.toLowerCase().includes(lowerField)) {
              serialized.headers[header] = '******';
            }
          });
        });
        
        // Add body if enabled
        if (logRequestBody && req.body) {
          serialized.body = { ...req.body };
          
          // Mask sensitive fields in body
          redactFields.forEach(field => {
            maskSensitiveData(serialized.body, field);
          });
        }
        
        return serialized;
      },
      res: (res) => {
        const serialized: any = {
          statusCode: res.statusCode,
          responseTime: res.responseTime,
        };
        
        // Add response body if enabled
        if (logResponseBody && res.body) {
          serialized.body = res.body;
        }
        
        return serialized;
      },
      err: pino.stdSerializers.err,
    },
    autoLogging: true,
  });
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Generate request ID if not present
    const requestId = req.headers['x-request-id'] as string || uuidv4();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
    
    // Use Pino HTTP logger
    httpLogger(req, res);
    
    // Capture original methods to intercept response body
    if (logResponseBody) {
      const originalSend = res.send;
      res.send = function(body) {
        (res as any).body = body;
        return originalSend.call(this, body);
      };
    }
    
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
 * Creates a child logger with additional context
 * 
 * @param logger Parent logger
 * @param context Additional context to include in logs
 * @returns Child logger
 */
export function createChildLogger(logger: pino.Logger, context: Record<string, any>) {
  return logger.child(context);
}

/**
 * Express middleware that adds correlation IDs to the request
 * 
 * @returns Express middleware
 */
export function correlationMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Generate request ID if not present
    const requestId = req.headers['x-request-id'] as string || uuidv4();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
    
    // Store request ID in request object for later use
    (req as any).id = requestId;
    
    next();
  };
}