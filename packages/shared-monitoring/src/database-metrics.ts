import { databaseConnectionsActive, databaseQueryDuration } from './metrics';

/**
 * Options for database metrics collection
 */
export interface DatabaseMetricsOptions {
  /**
   * Service name to include in metrics labels
   */
  serviceName: string;
  
  /**
   * Database type (e.g., 'postgresql', 'clickhouse', 'redis')
   */
  databaseType: string;
}

/**
 * Records database connection metrics
 * 
 * @param options Configuration options
 * @param connectionCount Number of active connections
 */
export function recordDatabaseConnections(
  options: DatabaseMetricsOptions,
  connectionCount: number
): void {
  const { serviceName, databaseType } = options;
  
  databaseConnectionsActive.set(
    { database: databaseType, service: serviceName },
    connectionCount
  );
}

/**
 * Records database query duration
 * 
 * @param options Configuration options
 * @param queryType Type of query (e.g., 'select', 'insert', 'update', 'delete')
 * @param durationMs Duration in milliseconds
 */
export function recordQueryDuration(
  options: DatabaseMetricsOptions,
  queryType: string,
  durationMs: number
): void {
  const { serviceName, databaseType } = options;
  
  databaseQueryDuration.observe(
    { query_type: queryType, database: databaseType, service: serviceName },
    durationMs / 1000 // Convert to seconds
  );
}

/**
 * Creates a function that wraps database queries with metrics collection
 * 
 * @param options Configuration options
 * @returns Function that wraps database queries
 */
export function createQueryMetricsWrapper<T>(options: DatabaseMetricsOptions) {
  return async (
    queryType: string,
    queryFn: () => Promise<T>
  ): Promise<T> => {
    const startTime = Date.now();
    
    try {
      // Execute the query
      const result = await queryFn();
      
      // Record query duration
      const duration = Date.now() - startTime;
      recordQueryDuration(options, queryType, duration);
      
      return result;
    } catch (error) {
      // Record query duration even if it fails
      const duration = Date.now() - startTime;
      recordQueryDuration(options, `${queryType}_error`, duration);
      
      // Re-throw the error
      throw error;
    }
  };
}

/**
 * Creates a higher-order function that wraps a database client with metrics collection
 * 
 * @param options Configuration options
 * @returns Function that wraps a database client
 */
export function withDatabaseMetrics<T extends Record<string, any>>(
  options: DatabaseMetricsOptions
) {
  return (client: T): T => {
    const wrappedClient = { ...client };
    
    // Wrap methods that execute queries
    const methodsToWrap = [
      'query', 'execute', 'exec', 'run', 
      'select', 'insert', 'update', 'delete',
      'get', 'all', 'find', 'findOne'
    ];
    
    for (const method of methodsToWrap) {
      if (typeof client[method] === 'function') {
        const originalMethod = client[method].bind(client);
        
        wrappedClient[method] = async (...args: any[]) => {
          const startTime = Date.now();
          
          try {
            // Execute the original method
            const result = await originalMethod(...args);
            
            // Record query duration
            const duration = Date.now() - startTime;
            recordQueryDuration(options, method, duration);
            
            return result;
          } catch (error) {
            // Record query duration even if it fails
            const duration = Date.now() - startTime;
            recordQueryDuration(options, `${method}_error`, duration);
            
            // Re-throw the error
            throw error;
          }
        };
      }
    }
    
    return wrappedClient;
  };
}