import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { register } from 'prom-client';
import path from 'path';
import fs from 'fs/promises';
import {
  metricsMiddleware,
  errorMetricsMiddleware,
  HealthMonitor,
  createDatabaseHealthChecker,
  createExternalServiceHealthChecker
} from '@url-shortener/shared-monitoring';
import { 
  checkClickHouseHealth
} from '@url-shortener/shared-db/src/clickhouse';
import { 
  createGlobalRateLimiter, 
  createEndpointRateLimiter 
} from '@url-shortener/shared-rate-limiter';

// Import our services
import { clickEventProcessor } from './services/clickEventProcessor';
import { queueConsumer } from './services/queueConsumer';

// Import controllers
import {
  getUrlAnalytics,
  getGeographicDistribution,
  getDeviceBreakdown,
  getTimeSeriesData,
  getReferrerData
} from './controllers/analyticsController';

const app = express();
const PORT = process.env.PORT || 3002;
const SERVICE_NAME = 'analytics';

// Health monitor setup
const healthMonitor = new HealthMonitor();

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());

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

// Add health checks
healthMonitor.addCheck('clickhouse', createDatabaseHealthChecker(checkClickHouseHealth, 'clickhouse'));
healthMonitor.addCheck('messageQueue', createExternalServiceHealthChecker('RabbitMQ', queueConsumer.checkHealth.bind(queueConsumer)));

// Routes
app.get('/health', healthMonitor.getHealthEndpoint());

app.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
});

// Analytics API endpoints
app.get('/api/v1/analytics/:urlId', 
  createEndpointRateLimiter('analytics-summary', {
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
  getUrlAnalytics
);

app.get('/api/v1/analytics/:urlId/geo', 
  createEndpointRateLimiter('analytics-geo', {
    authenticated: {
      limit: 30, // 30 requests per minute for authenticated users
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 5, // 5 requests per minute for anonymous users
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  getGeographicDistribution
);

app.get('/api/v1/analytics/:urlId/devices', 
  createEndpointRateLimiter('analytics-devices', {
    authenticated: {
      limit: 30, // 30 requests per minute for authenticated users
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 5, // 5 requests per minute for anonymous users
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  getDeviceBreakdown
);

app.get('/api/v1/analytics/:urlId/timeseries', 
  createEndpointRateLimiter('analytics-timeseries', {
    authenticated: {
      limit: 30, // 30 requests per minute for authenticated users
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 5, // 5 requests per minute for anonymous users
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  getTimeSeriesData
);

app.get('/api/v1/analytics/:urlId/referrers', 
  createEndpointRateLimiter('analytics-referrers', {
    authenticated: {
      limit: 30, // 30 requests per minute for authenticated users
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 5, // 5 requests per minute for anonymous users
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  getReferrerData
);

// Manual click event processing endpoint (for testing)
app.post('/api/v1/events/click', 
  createEndpointRateLimiter('event-processing', {
    authenticated: {
      limit: 100, // 100 events per minute for authenticated users
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 20, // 20 events per minute for anonymous users
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  async (req, res) => {
  try {
    const clickEvent = req.body;
    
    // Validate required fields
    if (!clickEvent.shortUrlId || !clickEvent.timestamp || !clickEvent.ipAddress || !clickEvent.userAgent) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Process event
    await clickEventProcessor.processEvent(clickEvent);
    
    res.json({ status: 'processed', eventId: `event_${Date.now()}` });
  } catch (error) {
    console.error('Error processing click event:', error);
    res.status(500).json({ error: 'Failed to process click event' });
  }
});

// Error handling middleware
app.use(errorMetricsMiddleware(SERVICE_NAME));

// Create data directory for GeoIP database if it doesn't exist
async function ensureDataDirectory() {
  const dataDir = path.join(__dirname, '../data');
  try {
    await fs.access(dataDir);
  } catch (error) {
    await fs.mkdir(dataDir, { recursive: true });
    console.log(`Created data directory at ${dataDir}`);
  }
}

// Initialize services and start server
async function start() {
  try {
    // Ensure data directory exists
    await ensureDataDirectory();
    
    // Initialize click event processor
    await clickEventProcessor.initialize();
    
    // Connect to message queue and start consuming
    await queueConsumer.connect();
    await queueConsumer.startConsuming();
    
    // Start server
    app.listen(PORT, () => {
      console.log(`Analytics Service running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`Metrics: http://localhost:${PORT}/metrics`);
    });
    
    // Setup graceful shutdown
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('Failed to start analytics service:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down analytics service...');
  
  try {
    // Stop queue consumer
    await queueConsumer.close();
    
    // Flush remaining events
    await clickEventProcessor.shutdown();
    
    console.log('Analytics service shut down successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Start the service
start().catch(error => {
  console.error('Failed to start analytics service:', error);
  process.exit(1);
});