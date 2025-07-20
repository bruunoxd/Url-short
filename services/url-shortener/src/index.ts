import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { register } from 'prom-client';
import path from 'path';
import { UAParser } from 'ua-parser-js';
import {
  metricsMiddleware,
  errorMetricsMiddleware,
  HealthMonitor,
  createDatabaseHealthChecker,
  createRedisHealthChecker,
  createExternalServiceHealthChecker,
  urlsCreatedTotal,
  redirectsTotal,
  databaseConnectionsActive,
  cacheHitRatio,
  cacheOperations,
  httpRequestDuration,
  apiResponseMiddleware,
  apiVersioningMiddleware,
  requestLoggingMiddleware,
  configureOpenApi
} from '@url-shortener/shared-monitoring';
import { 
  checkPostgresHealth, 
  checkRedisHealth,
  ShortUrlEntity
} from '@url-shortener/shared-db';
import { UrlService } from './services/urlService';
import { cacheService } from './services/cacheService';
import { queueService } from './services/queueService';
import { 
  CreateUrlSchema, 
  UpdateUrlSchema, 
  ClickEvent, 
  ApiVersion 
} from '@url-shortener/shared-types';
import { 
  createGlobalRateLimiter, 
  createEndpointRateLimiter,
  sanitizeInputMiddleware,
  securityHeadersMiddleware,
  sanitizeUrl
} from '@url-shortener/shared-rate-limiter';

const app = express();
const PORT = process.env.PORT || 3001;
const SERVICE_NAME = 'url-shortener';

// Initialize services
const urlService = new UrlService();

// Health monitor setup
const healthMonitor = new HealthMonitor();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*', // Restrict in production
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-Request-Id'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));
app.use(compression());
app.use(express.json());

// Add timestamp to request for logging
app.use((req, res, next) => {
  req.startTime = Date.now();
  next();
});

// Security middleware
app.use(sanitizeInputMiddleware());
app.use(securityHeadersMiddleware({
  hsts: true,
  contentSecurityPolicy: true,
  xssProtection: true,
  noSniff: true,
  frameOptions: true,
  referrerPolicy: true
}));

// API versioning middleware
app.use(apiVersioningMiddleware(ApiVersion.V1));

// API response standardization middleware
app.use(apiResponseMiddleware(ApiVersion.V1));

// Enhanced request logging with sensitive data filtering
app.use(requestLoggingMiddleware({
  sensitiveFields: ['password', 'token', 'authorization', 'apiKey'],
  logBody: true,
  logHeaders: true,
  serviceName: SERVICE_NAME,
  logLevel: 'info'
}));

// Metrics middleware
app.use(metricsMiddleware({ serviceName: SERVICE_NAME }));

// Global rate limiter - applies to all routes
app.use(createGlobalRateLimiter({
  authenticated: {
    limit: 100, // 100 requests per minute for authenticated users
    windowSizeInSeconds: 60,
    headers: true
  },
  anonymous: {
    limit: 20, // 20 requests per minute for anonymous users
    windowSizeInSeconds: 60,
    headers: true
  }
}));

// Add health checks using our enhanced health check utilities
healthMonitor.addCheck('database', createDatabaseHealthChecker(checkPostgresHealth, 'postgresql'));
healthMonitor.addCheck('redis', createRedisHealthChecker({ ping: async () => checkRedisHealth() }, 'redis'));
healthMonitor.addCheck('messageQueue', createExternalServiceHealthChecker('RabbitMQ', async () => queueService.checkHealth()));

// Routes
app.get('/health', healthMonitor.getHealthEndpoint());

app.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
});

// URL management API endpoints
// 1. Create URL - POST /api/v1/urls
app.post('/api/v1/urls', 
  // Stricter rate limit for URL creation
  createEndpointRateLimiter('create-url', {
    authenticated: {
      limit: 50, // 50 URLs per minute for authenticated users
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 5, // 5 URLs per minute for anonymous users
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  async (req, res) => {
  try {
    // Validate request body against schema
    const validationResult = CreateUrlSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.format()
      });
    }
    
    // Get user ID from authentication (mock for now)
    const userId = req.headers['x-user-id'] as string || 'anonymous';
    
    // Create short URL
    const shortUrl = await urlService.createShortUrl(userId, validationResult.data);
    
    // Increment metrics
    urlsCreatedTotal.inc({ user_id: userId, service: SERVICE_NAME });
    
    // Return the created URL
    res.status(201).json(shortUrl);
  } catch (error) {
    console.error('Error creating short URL:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('malicious')) {
        return res.status(400).json({ error: error.message });
      }
      if (error.message.includes('Invalid URL')) {
        return res.status(400).json({ error: error.message });
      }
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. List URLs - GET /api/v1/urls
app.get('/api/v1/urls', 
  // Rate limit for listing URLs
  createEndpointRateLimiter('list-urls', {
    authenticated: {
      limit: 60, // 60 requests per minute for authenticated users
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 10, // 10 requests per minute for anonymous users
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  async (req, res) => {
  try {
    // Get user ID from authentication (mock for now)
    const userId = req.headers['x-user-id'] as string || 'anonymous';
    
    // Parse pagination and filtering parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const sortBy = req.query.sortBy as string || 'createdAt';
    const sortOrder = (req.query.sortOrder as string || 'desc') as 'asc' | 'desc';
    const searchTerm = req.query.search as string;
    const tagFilter = req.query.tags ? (req.query.tags as string).split(',') : undefined;
    const activeOnly = req.query.activeOnly !== 'false';
    
    // Get URLs for the user
    const result = await urlService.listUserShortUrls(userId, {
      page,
      limit,
      sortBy,
      sortOrder,
      searchTerm,
      tagFilter,
      activeOnly
    });
    
    // Return the URLs with pagination metadata
    res.status(200).json({
      urls: result.urls,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit)
      }
    });
  } catch (error) {
    console.error('Error listing URLs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Update URL - PUT /api/v1/urls/:id
app.put('/api/v1/urls/:id', 
  // Rate limit for updating URLs
  createEndpointRateLimiter('update-url', {
    authenticated: {
      limit: 30, // 30 updates per minute for authenticated users
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 5, // 5 updates per minute for anonymous users
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate request body against schema
    const validationResult = UpdateUrlSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.format()
      });
    }
    
    // Get user ID from authentication (mock for now)
    const userId = req.headers['x-user-id'] as string || 'anonymous';
    
    // Update the URL
    const updatedUrl = await urlService.updateShortUrl(id, userId, validationResult.data);
    
    // Return the updated URL
    res.status(200).json(updatedUrl);
  } catch (error) {
    console.error('Error updating URL:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('permission')) {
        return res.status(403).json({ error: error.message });
      }
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Delete URL - DELETE /api/v1/urls/:id
app.delete('/api/v1/urls/:id', 
  // Rate limit for deleting URLs
  createEndpointRateLimiter('delete-url', {
    authenticated: {
      limit: 20, // 20 deletes per minute for authenticated users
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 3, // 3 deletes per minute for anonymous users
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user ID from authentication (mock for now)
    const userId = req.headers['x-user-id'] as string || 'anonymous';
    
    // Delete the URL (soft delete)
    await urlService.deleteShortUrl(id, userId);
    
    // Return success with no content
    res.status(204).end();
  } catch (error) {
    console.error('Error deleting URL:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('permission')) {
        return res.status(403).json({ error: error.message });
      }
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve static files for custom error pages
app.use('/static', express.static(path.join(__dirname, 'public')));

// Custom 404 page for invalid short codes
app.get('/not-found', (req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Custom 410 page for expired links
app.get('/expired', (req, res) => {
  res.status(410).sendFile(path.join(__dirname, 'public', '410.html'));
});

// Redirect endpoint with analytics tracking
app.get('/:shortCode', 
  // Special rate limit for redirects - higher limits since this is the main service functionality
  createEndpointRateLimiter('redirect', {
    authenticated: {
      limit: 200, // 200 redirects per minute for authenticated users
      windowSizeInSeconds: 60,
      headers: false // Don't include rate limit headers in redirects
    },
    anonymous: {
      limit: 50, // 50 redirects per minute for anonymous users
      windowSizeInSeconds: 60,
      headers: false // Don't include rate limit headers in redirects
    }
  }),
  async (req, res) => {
  const startTime = Date.now();
  const { shortCode } = req.params;
  
  try {
    // Get the short URL with optimized caching
    const shortUrl = await urlService.getShortUrl(shortCode);
    
    // If not found or inactive, show custom 404 page
    if (!shortUrl || !shortUrl.isActive) {
      redirectsTotal.inc({ short_code: shortCode, status: 'not_found', service: SERVICE_NAME });
      return res.redirect('/not-found');
    }
    
    // Check if expired, show custom 410 page
    if (shortUrl.expiresAt && new Date(shortUrl.expiresAt) < new Date()) {
      redirectsTotal.inc({ short_code: shortCode, status: 'expired', service: SERVICE_NAME });
      return res.redirect('/expired');
    }
    
    // Track response time for this redirect
    const lookupTime = Date.now() - startTime;
    httpRequestDuration.observe(
      { method: 'GET', route: '/:shortCode', status_code: '302', service: SERVICE_NAME },
      lookupTime / 1000
    );
    
    // Increment redirect metrics
    redirectsTotal.inc({ short_code: shortCode, status: 'success', service: SERVICE_NAME });
    
    // Collect analytics data
    const userAgent = req.headers['user-agent'] || '';
    const referrer = req.headers['referer'] || '';
    const ipAddress = req.headers['x-forwarded-for'] as string || 
                      req.socket.remoteAddress || 
                      'unknown';
    
    // Parse user agent for device and browser info
    const parser = new UAParser(userAgent);
    const parsedUA = parser.getResult();
    
    // Create click event
    const clickEvent: ClickEvent = {
      shortUrlId: shortUrl.id,
      timestamp: new Date(),
      ipAddress,
      userAgent,
      referrer,
      // In a real implementation, these would be populated by a geolocation service
      country: 'Unknown', 
      city: 'Unknown',
      deviceType: parsedUA.device.type || 
                 (parsedUA.device.model ? 'mobile' : 'desktop'),
      browser: parsedUA.browser.name || 'unknown',
      os: parsedUA.os.name || 'unknown'
    };
    
    // Publish click event to message queue asynchronously (don't await)
    queueService.publishClickEvent(clickEvent)
      .catch(err => console.error('Failed to publish click event:', err));
    
    // Redirect to the original URL immediately (don't wait for analytics)
    res.redirect(302, shortUrl.originalUrl);
    
  } catch (error) {
    console.error('Error redirecting:', error);
    
    // Record error metrics
    redirectsTotal.inc({ short_code: shortCode, status: 'error', service: SERVICE_NAME });
    
    // Calculate total time spent
    const totalTime = Date.now() - startTime;
    httpRequestDuration.observe(
      { method: 'GET', route: '/:shortCode', status_code: '500', service: SERVICE_NAME },
      totalTime / 1000
    );
    
    // Show error page
    res.status(500).sendFile(path.join(__dirname, 'public', '500.html'));
  }
});

// Error handling middleware
app.use(errorMetricsMiddleware(SERVICE_NAME));

// Update connection metrics periodically
setInterval(() => {
  // Simulate database connection count
  const dbConnections = Math.floor(Math.random() * 20) + 5;
  databaseConnectionsActive.set({ database: 'postgresql', service: SERVICE_NAME }, dbConnections);
}, 5000);

// Import the cache warming utilities
import { initializeCacheWarming, getPopularUrls } from './utils/cacheUtils';

// Initialize cache warming with a 15-minute interval
const stopCacheWarming = initializeCacheWarming(15);

// Add a shutdown handler to stop cache warming when the application exits
process.on('SIGTERM', () => {
  console.log('Stopping cache warming schedule...');
  stopCacheWarming();
  
  // Give time for any in-progress operations to complete
  setTimeout(() => {
    console.log('Shutting down...');
    process.exit(0);
  }, 1000);
});

// Add cache health check
healthMonitor.addCheck('cache', async () => {
  try {
    // Test cache by setting and getting a value
    const testKey = 'health:test';
    const testValue = { timestamp: Date.now() };
    
    await cacheService.set(testKey, testValue);
    const retrieved = await cacheService.get(testKey);
    
    if (retrieved && retrieved.timestamp === testValue.timestamp) {
      return {
        status: 'healthy',
        message: 'Cache is working properly',
        details: {
          memoryCache: 'operational',
          redisCache: 'operational'
        }
      };
    } else {
      return {
        status: 'degraded',
        message: 'Cache retrieval failed',
        details: {
          memoryCache: 'operational',
          redisCache: 'degraded'
        }
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Cache health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
});

app.listen(PORT, () => {
  console.log(`URL Shortener Service running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Metrics: http://localhost:${PORT}/metrics`);
});