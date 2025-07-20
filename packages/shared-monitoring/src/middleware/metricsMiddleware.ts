import { Request, Response, NextFunction } from 'express';
import { httpRequestDuration } from '../metrics';

/**
 * Options for metrics middleware
 */
export interface MetricsMiddlewareOptions {
  /**
   * Service name to include in metrics labels
   */
  serviceName: string;
  
  /**
   * Whether to include path parameters in route labels
   * If true, routes like /users/:id will be labeled as /users/:id
   * If false, the actual path like /users/123 will be used
   * Default: true
   */
  normalizeRoutes?: boolean;
  
  /**
   * Whether to include query parameters in route labels
   * Default: false
   */
  includeQueryParams?: boolean;
}

/**
 * Middleware that records HTTP request metrics
 * 
 * @param options Configuration options
 * @returns Express middleware
 */
export function metricsMiddleware(options: MetricsMiddlewareOptions) {
  const {
    serviceName,
    normalizeRoutes = true,
    includeQueryParams = false,
  } = options;
  
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Record end time and calculate duration on response finish
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      // Get route path - use route.path if available (from Express router)
      // otherwise use the URL path
      let route = req.route?.path || req.path;
      
      // If normalizeRoutes is false, use the actual URL path
      if (!normalizeRoutes && req.route?.path) {
        route = req.path;
      }
      
      // Include query parameters if requested
      if (includeQueryParams && Object.keys(req.query).length > 0) {
        route = `${route}?${new URLSearchParams(req.query as Record<string, string>).toString()}`;
      }
      
      // Record request duration
      httpRequestDuration.observe(
        {
          method: req.method,
          route,
          status_code: res.statusCode.toString(),
          service: serviceName,
        },
        duration / 1000 // Convert to seconds
      );
    });
    
    next();
  };
}

/**
 * Middleware that records error metrics
 * 
 * @param serviceName Service name to include in metrics labels
 * @returns Express error handling middleware
 */
export function errorMetricsMiddleware(serviceName: string) {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    // Record error in metrics
    httpRequestDuration.observe(
      {
        method: req.method,
        route: req.route?.path || req.path,
        status_code: res.statusCode.toString() || '500',
        service: serviceName,
      },
      (Date.now() - (req.startTime || Date.now())) / 1000
    );
    
    // Pass to next error handler
    next(err);
  };
}