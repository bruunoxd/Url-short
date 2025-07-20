import { Request, Response, NextFunction } from 'express';
import { RateLimiter } from './rateLimiter';
import { RateLimitConfig, RateLimitRules, RateLimitHeaders } from './types';

/**
 * Generate a key for rate limiting based on the request
 * 
 * @param req - Express request object
 * @param keyPrefix - Prefix for the rate limit key
 * @returns Rate limit key
 */
const defaultKeyGenerator = (req: Request, keyPrefix: string): string => {
  // For authenticated users, use user ID
  if (req.user?.userId) {
    return `${keyPrefix}:user:${req.user.userId}`;
  }
  
  // For anonymous users, use IP address
  const ip = req.ip || 
    req.headers['x-forwarded-for'] as string || 
    req.socket.remoteAddress || 
    'unknown';
    
  return `${keyPrefix}:ip:${ip}`;
};

/**
 * Create rate limit headers
 * 
 * @param limit - Maximum number of requests allowed
 * @param remaining - Number of requests remaining
 * @param resetTime - Timestamp when the rate limit resets
 * @param used - Number of requests used
 * @returns Rate limit headers
 */
const createRateLimitHeaders = (
  limit: number,
  remaining: number,
  resetTime: number,
  used: number
): RateLimitHeaders => {
  return {
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(resetTime / 1000).toString(), // Convert to seconds
    'X-RateLimit-Used': used.toString()
  };
};

/**
 * Rate limiting middleware factory
 * 
 * @param keyPrefix - Prefix for the rate limit key
 * @param config - Rate limit configuration
 * @returns Express middleware
 */
export const rateLimiter = (keyPrefix: string, config: RateLimitConfig) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if we should skip rate limiting for this request
      if (config.skip && config.skip(req)) {
        return next();
      }
      
      // Generate key for this request
      const key = config.keyGenerator 
        ? config.keyGenerator(req) 
        : defaultKeyGenerator(req, keyPrefix);
      
      // Check rate limit
      const rateLimitInfo = await RateLimiter.check(
        key,
        config.limit,
        config.windowSizeInSeconds
      );
      
      // Calculate remaining requests
      const remaining = Math.max(0, rateLimitInfo.limit - rateLimitInfo.count);
      
      // Add rate limit headers if enabled
      if (config.headers !== false) {
        const headers = createRateLimitHeaders(
          rateLimitInfo.limit,
          remaining,
          rateLimitInfo.resetTime,
          rateLimitInfo.count
        );
        
        Object.entries(headers).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
      }
      
      // If rate limit exceeded, return 429 Too Many Requests
      if (rateLimitInfo.count > rateLimitInfo.limit) {
        return res.status(429).json({
          error: {
            code: 'rate_limit_exceeded',
            message: 'Rate limit exceeded. Please try again later.',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
            retryAfter: Math.ceil((rateLimitInfo.resetTime - Date.now()) / 1000)
          }
        });
      }
      
      // Continue to the next middleware
      next();
    } catch (error) {
      console.error('Rate limiting error:', error);
      // Don't block the request if rate limiting fails
      next();
    }
  };
};

/**
 * Dynamic rate limiter that applies different limits based on authentication status
 * 
 * @param keyPrefix - Prefix for the rate limit key
 * @param rules - Rate limit rules for authenticated and anonymous users
 * @returns Express middleware
 */
export const dynamicRateLimiter = (keyPrefix: string, rules: RateLimitRules) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Select the appropriate rate limit configuration based on authentication status
      const config = req.user ? rules.authenticated : rules.anonymous;
      
      // Apply the rate limiter with the selected configuration
      return rateLimiter(keyPrefix, config)(req, res, next);
    } catch (error) {
      console.error('Dynamic rate limiting error:', error);
      // Don't block the request if rate limiting fails
      next();
    }
  };
};

/**
 * Create a rate limiter for a specific endpoint
 * 
 * @param endpoint - Endpoint name or path
 * @param rules - Rate limit rules
 * @returns Express middleware
 */
export const createEndpointRateLimiter = (endpoint: string, rules: RateLimitRules) => {
  return dynamicRateLimiter(`endpoint:${endpoint}`, rules);
};

/**
 * Create a global rate limiter for all endpoints
 * 
 * @param rules - Rate limit rules
 * @returns Express middleware
 */
export const createGlobalRateLimiter = (rules: RateLimitRules) => {
  return dynamicRateLimiter('global', rules);
};