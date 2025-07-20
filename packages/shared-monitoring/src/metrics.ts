import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

// Initialize default metrics collection
collectDefaultMetrics({ register });

// Business Metrics
export const urlsCreatedTotal = new Counter({
  name: 'url_shortener_urls_created_total',
  help: 'Total number of URLs created',
  labelNames: ['user_id', 'service'],
  registers: [register]
});

export const redirectsTotal = new Counter({
  name: 'url_shortener_redirects_total',
  help: 'Total number of redirects processed',
  labelNames: ['short_code', 'status', 'service'],
  registers: [register]
});

export const activeUsersGauge = new Gauge({
  name: 'url_shortener_active_users_gauge',
  help: 'Number of currently active users',
  labelNames: ['service'],
  registers: [register]
});

export const clickEventsProcessed = new Counter({
  name: 'url_shortener_click_events_processed_total',
  help: 'Total number of click events processed',
  labelNames: ['service', 'status'],
  registers: [register]
});

// Technical Metrics
export const httpRequestDuration = new Histogram({
  name: 'http_requests_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

export const databaseConnectionsActive = new Gauge({
  name: 'database_connections_active',
  help: 'Number of active database connections',
  labelNames: ['database', 'service'],
  registers: [register]
});

export const cacheHitRatio = new Gauge({
  name: 'cache_hit_ratio',
  help: 'Cache hit ratio (0-1)',
  labelNames: ['cache_type', 'service'],
  registers: [register]
});

export const cacheOperations = new Counter({
  name: 'cache_operations_total',
  help: 'Total number of cache operations',
  labelNames: ['operation', 'result', 'service'],
  registers: [register]
});

export const queueMessagesProcessed = new Counter({
  name: 'queue_messages_processed_total',
  help: 'Total number of queue messages processed',
  labelNames: ['queue', 'status', 'service'],
  registers: [register]
});

export const databaseQueryDuration = new Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['query_type', 'database', 'service'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register]
});

// Export the registry for metrics endpoint
export { register };