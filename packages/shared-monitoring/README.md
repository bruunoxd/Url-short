# Shared Monitoring Package

This package provides monitoring, observability, and metrics collection utilities for the URL Shortener Platform.

## Features

### Metrics Collection

- Prometheus metrics for business and technical metrics
- Custom metrics for database operations
- Cache performance metrics
- HTTP request metrics
- Queue processing metrics
- Middleware for automatic metrics collection

### Health Checks

- Health check endpoints for all services
- Database health checks
- Redis health checks
- External service health checks
- Customizable health check system

### Distributed Tracing

- OpenTelemetry integration
- Automatic instrumentation for Express, HTTP, PostgreSQL, Redis, and RabbitMQ
- Manual span creation utilities
- Trace context propagation
- Middleware for trace ID propagation

### Structured Logging

- Pino-based structured logging
- Request/response logging middleware
- Correlation ID propagation
- Sensitive data redaction
- Log level configuration
- Child logger creation

### API Documentation and Versioning

- OpenAPI/Swagger documentation
- API versioning middleware
- API response standardization
- API contract validation

## Usage

### Metrics Collection

```typescript
import { 
  urlsCreatedTotal, 
  redirectsTotal, 
  httpRequestDuration,
  metricsMiddleware 
} from '@url-shortener/shared-monitoring';

// Use middleware to automatically collect HTTP metrics
app.use(metricsMiddleware({ serviceName: 'my-service' }));

// Record business metrics
urlsCreatedTotal.inc({ user_id: 'user123', service: 'my-service' });
redirectsTotal.inc({ short_code: 'abc123', status: 'success', service: 'my-service' });

// Expose metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
});
```

### Health Checks

```typescript
import { 
  HealthMonitor, 
  createDatabaseHealthChecker 
} from '@url-shortener/shared-monitoring';

// Create health monitor
const healthMonitor = new HealthMonitor();

// Add health checks
healthMonitor.addCheck('database', createDatabaseHealthChecker(checkPostgres, 'postgresql'));
healthMonitor.addCheck('redis', createRedisHealthChecker({ ping: checkRedis }, 'redis'));

// Expose health endpoint
app.get('/health', healthMonitor.getHealthEndpoint());
```

### Distributed Tracing

```typescript
import { 
  initTracing, 
  tracingMiddleware, 
  withSpan 
} from '@url-shortener/shared-monitoring';

// Initialize tracing
initTracing({ serviceName: 'my-service' });

// Use middleware to propagate trace context
app.use(tracingMiddleware());

// Wrap functions with spans
async function processData(data) {
  return withSpan('process-data', async () => {
    // Process data
    return result;
  });
}
```

### Structured Logging

```typescript
import { 
  createLogger, 
  createRequestLogger 
} from '@url-shortener/shared-monitoring';

// Create logger
const logger = createLogger({ serviceName: 'my-service' });

// Use request logging middleware
app.use(createRequestLogger({ serviceName: 'my-service' }));

// Log messages
logger.info({ userId: 'user123' }, 'User logged in');
logger.error({ err }, 'Failed to process request');
```

## Testing

Run the tests with:

```bash
npm run test
npm run test:metrics
npm run test:observability
```