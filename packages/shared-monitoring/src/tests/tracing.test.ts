import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initTracing, shutdownTracing, tracingMiddleware, getTracer, createDbSpan, withSpan } from '../tracing';

// Create mock implementations
const mockSpan = {
  end: vi.fn(),
  recordException: vi.fn(),
  setStatus: vi.fn(),
  spanContext: vi.fn().mockReturnValue({
    traceId: 'mock-trace-id',
  }),
};

const mockTracer = {
  startSpan: vi.fn().mockReturnValue(mockSpan),
};

const mockGetTracer = vi.fn().mockReturnValue(mockTracer);

// Mock OpenTelemetry modules
vi.mock('@opentelemetry/sdk-node', () => {
  return {
    NodeSDK: vi.fn().mockImplementation(() => ({
      start: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock('@opentelemetry/auto-instrumentations-node', () => {
  return {
    getNodeAutoInstrumentations: vi.fn().mockReturnValue([]),
  };
});

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => {
  return {
    OTLPTraceExporter: vi.fn().mockImplementation(() => ({})),
  };
});

vi.mock('@opentelemetry/resources', () => {
  const mockResource = function() {
    return {};
  };
  
  mockResource.default = vi.fn().mockReturnValue({
    merge: vi.fn().mockReturnValue({}),
  });
  
  return {
    Resource: mockResource,
  };
});

vi.mock('@opentelemetry/semantic-conventions', () => {
  return {
    SemanticResourceAttributes: {
      SERVICE_NAME: 'service.name',
      SERVICE_VERSION: 'service.version',
      DEPLOYMENT_ENVIRONMENT: 'deployment.environment',
    },
  };
});

vi.mock('@opentelemetry/sdk-trace-node', () => {
  return {
    BatchSpanProcessor: vi.fn().mockImplementation(() => ({})),
  };
});

vi.mock('@opentelemetry/core', () => {
  return {
    W3CTraceContextPropagator: vi.fn().mockImplementation(() => ({})),
  };
});

vi.mock('@opentelemetry/instrumentation-express', () => {
  return {
    ExpressInstrumentation: vi.fn().mockImplementation(() => ({})),
  };
});

vi.mock('@opentelemetry/instrumentation-http', () => {
  return {
    HttpInstrumentation: vi.fn().mockImplementation(() => ({})),
  };
});

vi.mock('@opentelemetry/instrumentation-pg', () => {
  return {
    PgInstrumentation: vi.fn().mockImplementation(() => ({})),
  };
});

vi.mock('@opentelemetry/instrumentation-redis', () => {
  return {
    RedisInstrumentation: vi.fn().mockImplementation(() => ({})),
  };
});

vi.mock('@opentelemetry/instrumentation-ioredis', () => {
  return {
    IORedisInstrumentation: vi.fn().mockImplementation(() => ({})),
  };
});

vi.mock('@opentelemetry/instrumentation-amqplib', () => {
  return {
    AmqplibInstrumentation: vi.fn().mockImplementation(() => ({})),
  };
});

// Mock @opentelemetry/api
vi.mock('@opentelemetry/api', () => {
  return {
    trace: {
      getTracer: mockGetTracer,
      setSpan: vi.fn().mockReturnValue({}),
    },
    context: {
      active: vi.fn().mockReturnValue({}),
      with: vi.fn().mockImplementation((_, fn) => fn()),
    },
    INVALID_SPAN: {},
    SpanStatusCode: {
      ERROR: 'ERROR',
    },
  };
});

describe('Tracing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await shutdownTracing();
  });

  describe('initTracing', () => {
    it('should initialize tracing with default options', () => {
      const sdk = initTracing({ serviceName: 'test-service' });
      
      expect(sdk).toBeDefined();
      expect(sdk.start).toHaveBeenCalled();
    });

    it('should initialize tracing with custom options', () => {
      const options = {
        serviceName: 'test-service',
        serviceVersion: '2.0.0',
        environment: 'staging',
        otlpEndpoint: 'http://custom-endpoint:4318/v1/traces',
        enableConsoleExporter: true,
        samplingRatio: 0.5,
      };
      
      const sdk = initTracing(options);
      
      expect(sdk).toBeDefined();
      expect(sdk.start).toHaveBeenCalled();
    });
  });

  describe('shutdownTracing', () => {
    it('should shutdown tracing', async () => {
      const sdk = initTracing({ serviceName: 'test-service' });
      
      await shutdownTracing();
      
      expect(sdk.shutdown).toHaveBeenCalled();
    });

    it('should handle shutdown when tracing is not initialized', async () => {
      await shutdownTracing(); // Should not throw
    });
  });

  describe('tracingMiddleware', () => {
    it('should add trace ID to response headers', () => {
      const middleware = tracingMiddleware();
      
      const req = {
        span: {
          spanContext: () => ({
            traceId: 'test-trace-id',
          }),
        },
      };
      
      const res = {
        setHeader: vi.fn(),
      };
      
      const next = vi.fn();
      
      middleware(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('X-Trace-ID', 'test-trace-id');
      expect(next).toHaveBeenCalled();
    });

    it('should handle missing span', () => {
      const middleware = tracingMiddleware();
      
      const req = {};
      const res = {
        setHeader: vi.fn(),
      };
      const next = vi.fn();
      
      middleware(req, res, next);
      
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('getTracer', () => {
    it('should return a tracer', () => {
      const tracer = getTracer('test-tracer');
      expect(tracer).toBeDefined();
    });
  });

  describe('createDbSpan', () => {
    it('should create a span for database operations', () => {
      const span = createDbSpan('test-span', 'postgresql', 'SELECT * FROM users');
      expect(span).toBeDefined();
    });
  });

  describe('withSpan', () => {
    it('should wrap a function with a span', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const result = await withSpan('test-span', fn, { custom: 'attribute' });
      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
    });

    it('should handle errors in wrapped functions', async () => {
      const error = new Error('Test error');
      const fn = vi.fn().mockRejectedValue(error);
      await expect(withSpan('test-span', fn)).rejects.toThrow(error);
      expect(fn).toHaveBeenCalled();
    });
  });
});