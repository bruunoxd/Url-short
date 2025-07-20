import { Request, Response } from 'express';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  responseTime?: number;
  details?: Record<string, any>;
}

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, HealthStatus>;
  timestamp: string;
  uptime: number;
  version?: string;
}

export type HealthChecker = () => Promise<HealthStatus>;

export class HealthMonitor {
  private checkers: Map<string, HealthChecker> = new Map();
  private startTime: number = Date.now();

  addCheck(name: string, checker: HealthChecker): void {
    this.checkers.set(name, checker);
  }

  removeCheck(name: string): void {
    this.checkers.delete(name);
  }

  async runChecks(): Promise<HealthCheck> {
    const checks: Record<string, HealthStatus> = {};
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Run all health checks in parallel
    const checkPromises = Array.from(this.checkers.entries()).map(async ([name, checker]) => {
      try {
        const startTime = Date.now();
        const result = await Promise.race([
          checker(),
          new Promise<HealthStatus>((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          )
        ]);
        result.responseTime = Date.now() - startTime;
        checks[name] = result;
      } catch (error) {
        checks[name] = {
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Unknown error',
          responseTime: Date.now() - Date.now()
        };
      }
    });

    await Promise.all(checkPromises);

    // Determine overall status
    const statuses = Object.values(checks).map(check => check.status);
    if (statuses.some(status => status === 'unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (statuses.some(status => status === 'degraded')) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      checks,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: process.env.npm_package_version
    };
  }

  getHealthEndpoint() {
    return async (req: Request, res: Response) => {
      try {
        const health = await this.runChecks();
        const statusCode = health.status === 'healthy' ? 200 : 
                          health.status === 'degraded' ? 200 : 503;
        
        res.status(statusCode).json(health);
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          checks: {},
          timestamp: new Date().toISOString(),
          uptime: Date.now() - this.startTime,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    };
  }
}

// Common health checkers
export const createDatabaseHealthChecker = (
  checkConnection: () => Promise<boolean>,
  name: string = 'database'
): HealthChecker => {
  return async (): Promise<HealthStatus> => {
    try {
      const isConnected = await checkConnection();
      return {
        status: isConnected ? 'healthy' : 'unhealthy',
        message: isConnected ? `${name} connection is healthy` : `${name} connection failed`
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `${name} health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  };
};

export const createRedisHealthChecker = (
  redisClient: { ping: () => Promise<string | boolean> },
  name: string = 'redis'
): HealthChecker => {
  return async (): Promise<HealthStatus> => {
    try {
      const result = await redisClient.ping();
      const isHealthy = result === 'PONG' || result === true;
      
      return {
        status: isHealthy ? 'healthy' : 'degraded',
        message: isHealthy ? `${name} connection is healthy` : `${name} returned unexpected response`
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `${name} health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  };
};

export const createExternalServiceHealthChecker = (
  serviceName: string,
  checkFunction: () => Promise<boolean>
): HealthChecker => {
  return async (): Promise<HealthStatus> => {
    try {
      const isHealthy = await checkFunction();
      return {
        status: isHealthy ? 'healthy' : 'degraded',
        message: isHealthy ? `${serviceName} is responding` : `${serviceName} is not responding`
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `${serviceName} health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  };
};