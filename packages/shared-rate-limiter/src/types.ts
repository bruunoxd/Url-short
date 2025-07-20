/**
 * Rate limit configuration for an endpoint
 */
export interface RateLimitConfig {
  // Number of requests allowed in the time window
  limit: number;
  
  // Time window in seconds
  windowSizeInSeconds: number;
  
  // Optional custom key generator function
  keyGenerator?: (req: Express.Request) => string;
  
  // Optional custom skip function
  skip?: (req: Express.Request) => boolean;
  
  // Whether to include headers in the response
  headers?: boolean;
}

/**
 * Rate limit configuration for different user types
 */
export interface RateLimitRules {
  // Rate limit for authenticated users
  authenticated: RateLimitConfig;
  
  // Rate limit for anonymous users
  anonymous: RateLimitConfig;
}

/**
 * Rate limit store data structure
 */
export interface RateLimitInfo {
  // Number of requests made in the current window
  count: number;
  
  // Timestamp when the current window resets (Unix timestamp in ms)
  resetTime: number;
  
  // Time window in seconds
  windowSizeInSeconds: number;
  
  // Maximum number of requests allowed in the window
  limit: number;
}

/**
 * Rate limit response headers
 */
export interface RateLimitHeaders {
  // Number of requests allowed in the time window
  'X-RateLimit-Limit': string;
  
  // Number of requests remaining in the current window
  'X-RateLimit-Remaining': string;
  
  // Timestamp when the current window resets (Unix timestamp in seconds)
  'X-RateLimit-Reset': string;
  
  // Whether the request was rate limited
  'X-RateLimit-Used': string;
}