import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { AmqplibInstrumentation } from '@opentelemetry/instrumentation-amqplib';

/**
 * Configuration options for the tracing setup
 */
export interface TracingOptions {
  /**
   * Service name for the traces
   */
  serviceName: string;
  
  /**
   * Service version
   */
  serviceVersion?: string;
  
  /**
   * Environment (e.g., 'production', 'development', 'staging')
   */
  environment?: string;
  
  /**
   * OTLP endpoint for sending traces
   * Default: http://localhost:4318/v1/traces
   */
  otlpEndpoint?: string;
  
  /**
   * Whether to enable console exporter for debugging
   * Default: false
   */
  enableConsoleExporter?: boolean;
  
  /**
   * Sampling rate (0.0 - 1.0)
   * Default: 1.0 (all traces)
   */
  samplingRatio?: number;
}

let sdk: NodeSDK | undefined;

/**
 * Initializes distributed tracing with OpenTelemetry
 * 
 * @param options Configuration options
 * @returns The OpenTelemetry SDK instance
 */
export function initTracing(options: TracingOptions): NodeSDK {
  const {
    serviceName,
    serviceVersion = '1.0.0',
    environment = process.env.NODE_ENV || 'development',
    otlpEndpoint = process.env.OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    enableConsoleExporter = process.env.NODE_ENV !== 'production',
    samplingRatio = 1.0,
  } = options;
  
  // Create a trace exporter
  const traceExporter = new OTLPTraceExporter({
    url: otlpEndpoint,
  });
  
  // Create a resource that identifies your service
  const resource = Resource.default().merge(
    new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
    })
  );
  
  // Create and configure the OpenTelemetry SDK
  sdk = new NodeSDK({
    resource,
    traceExporter,
    spanProcessor: new BatchSpanProcessor(traceExporter),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Enable specific instrumentations
        '@opentelemetry/instrumentation-fs': {
          enabled: false, // Disable file system instrumentation to reduce noise
        },
      }),
      new ExpressInstrumentation(),
      new HttpInstrumentation(),
      new PgInstrumentation(),
      new RedisInstrumentation(),
      new IORedisInstrumentation(),
      new AmqplibInstrumentation(),
    ],
    textMapPropagator: new W3CTraceContextPropagator(),
  });
  
  // Start the SDK
  sdk.start();
  
  // Handle process shutdown
  process.on('SIGTERM', () => {
    shutdownTracing()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.error('Error terminating tracing', error))
      .finally(() => process.exit(0));
  });
  
  return sdk;
}

/**
 * Shuts down the tracing SDK
 * 
 * @returns Promise that resolves when shutdown is complete
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = undefined;
  }
}

/**
 * Express middleware that adds trace context to the request
 * 
 * @returns Express middleware
 */
export function tracingMiddleware() {
  return (req: any, res: any, next: any) => {
    // The actual tracing is handled by the OpenTelemetry Express instrumentation
    // This middleware is just a placeholder for additional custom logic
    
    // Add trace ID to response headers for debugging
    const span = req.span;
    if (span) {
      const traceId = span.spanContext().traceId;
      res.setHeader('X-Trace-ID', traceId);
    }
    
    next();
  };
}

/**
 * Creates a tracer for manual instrumentation
 * 
 * @param name Name of the tracer
 * @returns Tracer instance
 */
export function getTracer(name: string) {
  const api = require('@opentelemetry/api');
  return api.trace.getTracer(name);
}

/**
 * Creates a span for a database operation
 * 
 * @param name Name of the span
 * @param dbSystem Database system (e.g., 'postgresql', 'redis')
 * @param statement SQL statement or command
 * @returns Span instance
 */
export function createDbSpan(name: string, dbSystem: string, statement: string) {
  const api = require('@opentelemetry/api');
  const tracer = api.trace.getTracer('db-operations');
  
  return tracer.startSpan(name, {
    attributes: {
      'db.system': dbSystem,
      'db.statement': statement,
    },
  });
}

/**
 * Wraps a function with a span
 * 
 * @param name Name of the span
 * @param fn Function to wrap
 * @param attributes Additional attributes for the span
 * @returns Wrapped function
 */
export function withSpan<T>(name: string, fn: () => Promise<T>, attributes?: Record<string, any>): Promise<T> {
  const api = require('@opentelemetry/api');
  const tracer = api.trace.getTracer('function-tracing');
  
  return api.context.with(api.trace.setSpan(api.context.active(), api.INVALID_SPAN), () => {
    const span = tracer.startSpan(name, { attributes });
    
    return api.context.with(api.trace.setSpan(api.context.active(), span), async () => {
      try {
        const result = await fn();
        span.end();
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: api.SpanStatusCode.ERROR });
        span.end();
        throw error;
      }
    });
  });
}