import { checkPostgresHealth, getPoolStats } from './postgres';
import { checkClickHouseHealth } from './clickhouse';
import { checkRedisHealth } from './redis';

/**
 * Health status interface
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  details?: Record<string, any>;
}

/**
 * Check PostgreSQL health
 */
export async function getPostgresHealthStatus(): Promise<HealthStatus> {
  try {
    const isHealthy = await checkPostgresHealth();
    const poolStats = getPoolStats();
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      message: isHealthy ? 'PostgreSQL connection is healthy' : 'PostgreSQL connection failed',
      details: isHealthy ? poolStats : undefined,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `PostgreSQL health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check ClickHouse health
 */
export async function getClickHouseHealthStatus(): Promise<HealthStatus> {
  try {
    const isHealthy = await checkClickHouseHealth();
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      message: isHealthy ? 'ClickHouse connection is healthy' : 'ClickHouse connection failed',
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `ClickHouse health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check Redis health
 */
export async function getRedisHealthStatus(): Promise<HealthStatus> {
  try {
    const isHealthy = await checkRedisHealth();
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      message: isHealthy ? 'Redis connection is healthy' : 'Redis connection failed',
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Redis health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check all database connections
 */
export async function getAllDatabaseHealthStatus(): Promise<Record<string, HealthStatus>> {
  const [postgres, clickhouse, redis] = await Promise.all([
    getPostgresHealthStatus().catch(error => ({
      status: 'unhealthy' as const,
      message: `PostgreSQL health check error: ${error.message}`,
    })),
    getClickHouseHealthStatus().catch(error => ({
      status: 'unhealthy' as const,
      message: `ClickHouse health check error: ${error.message}`,
    })),
    getRedisHealthStatus().catch(error => ({
      status: 'unhealthy' as const,
      message: `Redis health check error: ${error.message}`,
    })),
  ]);
  
  return {
    postgres,
    clickhouse,
    redis,
  };
}