import { cacheHitRatio, cacheOperations } from './metrics';

/**
 * Options for cache metrics collection
 */
export interface CacheMetricsOptions {
  /**
   * Service name to include in metrics labels
   */
  serviceName: string;
  
  /**
   * Cache type (e.g., 'redis', 'memory', 'multi-level')
   */
  cacheType: string;
}

/**
 * Records cache hit ratio
 * 
 * @param options Configuration options
 * @param hitRatio Ratio of cache hits to total requests (0-1)
 */
export function recordCacheHitRatio(
  options: CacheMetricsOptions,
  hitRatio: number
): void {
  const { serviceName, cacheType } = options;
  
  // Ensure ratio is between 0 and 1
  const normalizedRatio = Math.max(0, Math.min(1, hitRatio));
  
  cacheHitRatio.set(
    { cache_type: cacheType, service: serviceName },
    normalizedRatio
  );
}

/**
 * Records cache operation
 * 
 * @param options Configuration options
 * @param operation Operation type (e.g., 'get', 'set', 'delete')
 * @param result Result of operation (e.g., 'hit', 'miss', 'success', 'error')
 */
export function recordCacheOperation(
  options: CacheMetricsOptions,
  operation: string,
  result: string
): void {
  const { serviceName, cacheType } = options;
  
  cacheOperations.inc(
    { operation, result, service: serviceName, cache_type: cacheType }
  );
}

/**
 * Cache metrics tracker that maintains hit/miss counts and calculates hit ratio
 */
export class CacheMetricsTracker {
  private hits: number = 0;
  private misses: number = 0;
  private options: CacheMetricsOptions;
  private reportingInterval: NodeJS.Timeout | null = null;
  
  /**
   * Creates a new cache metrics tracker
   * 
   * @param options Configuration options
   * @param reportingIntervalMs Interval in milliseconds to report hit ratio (default: 60000)
   */
  constructor(options: CacheMetricsOptions, reportingIntervalMs: number = 60000) {
    this.options = options;
    
    // Start periodic reporting if interval is positive
    if (reportingIntervalMs > 0) {
      this.startReporting(reportingIntervalMs);
    }
  }
  
  /**
   * Records a cache hit
   */
  recordHit(): void {
    this.hits++;
    recordCacheOperation(this.options, 'get', 'hit');
  }
  
  /**
   * Records a cache miss
   */
  recordMiss(): void {
    this.misses++;
    recordCacheOperation(this.options, 'get', 'miss');
  }
  
  /**
   * Records a cache set operation
   * 
   * @param success Whether the operation was successful
   */
  recordSet(success: boolean): void {
    recordCacheOperation(this.options, 'set', success ? 'success' : 'error');
  }
  
  /**
   * Records a cache delete operation
   * 
   * @param success Whether the operation was successful
   */
  recordDelete(success: boolean): void {
    recordCacheOperation(this.options, 'delete', success ? 'success' : 'error');
  }
  
  /**
   * Gets the current hit ratio
   * 
   * @returns Hit ratio between 0 and 1, or 0 if no operations
   */
  getHitRatio(): number {
    const total = this.hits + this.misses;
    return total > 0 ? this.hits / total : 0;
  }
  
  /**
   * Reports the current hit ratio to metrics
   */
  reportHitRatio(): void {
    recordCacheHitRatio(this.options, this.getHitRatio());
  }
  
  /**
   * Starts periodic reporting of hit ratio
   * 
   * @param intervalMs Interval in milliseconds
   */
  startReporting(intervalMs: number): void {
    // Clear any existing interval
    this.stopReporting();
    
    // Start new interval
    this.reportingInterval = setInterval(() => {
      this.reportHitRatio();
    }, intervalMs);
  }
  
  /**
   * Stops periodic reporting of hit ratio
   */
  stopReporting(): void {
    if (this.reportingInterval) {
      clearInterval(this.reportingInterval);
      this.reportingInterval = null;
    }
  }
  
  /**
   * Resets hit and miss counts
   */
  reset(): void {
    this.hits = 0;
    this.misses = 0;
  }
}

/**
 * Creates a higher-order function that wraps a cache client with metrics collection
 * 
 * @param options Configuration options
 * @returns Function that wraps a cache client
 */
export function withCacheMetrics<T extends Record<string, any>>(
  options: CacheMetricsOptions
) {
  const tracker = new CacheMetricsTracker(options);
  
  return (client: T): T => {
    const wrappedClient = { ...client };
    
    // Wrap get method
    if (typeof client.get === 'function') {
      const originalGet = client.get.bind(client);
      
      wrappedClient.get = async (...args: any[]) => {
        try {
          const result = await originalGet(...args);
          
          // Record hit or miss
          if (result === undefined || result === null) {
            tracker.recordMiss();
          } else {
            tracker.recordHit();
          }
          
          return result;
        } catch (error) {
          // Record miss on error
          tracker.recordMiss();
          throw error;
        }
      };
    }
    
    // Wrap set method
    if (typeof client.set === 'function') {
      const originalSet = client.set.bind(client);
      
      wrappedClient.set = async (...args: any[]) => {
        try {
          const result = await originalSet(...args);
          tracker.recordSet(true);
          return result;
        } catch (error) {
          tracker.recordSet(false);
          throw error;
        }
      };
    }
    
    // Wrap delete method
    if (typeof client.delete === 'function') {
      const originalDelete = client.delete.bind(client);
      
      wrappedClient.delete = async (...args: any[]) => {
        try {
          const result = await originalDelete(...args);
          tracker.recordDelete(true);
          return result;
        } catch (error) {
          tracker.recordDelete(false);
          throw error;
        }
      };
    }
    
    return wrappedClient;
  };
}