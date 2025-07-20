import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { register } from 'prom-client';
import {
  metricsMiddleware,
  errorMetricsMiddleware,
  HealthMonitor,
  createDatabaseHealthChecker,
  createRedisHealthChecker
} from '@url-shortener/shared-monitoring';
import { getPostgresPool } from '@url-shortener/shared-db';
import { getRedisClient } from '@url-shortener/shared-db';
import authController from './controllers/authController';
import { authenticate } from './middleware/authMiddleware';
import { 
  createGlobalRateLimiter, 
  createEndpointRateLimiter 
} from '@url-shortener/shared-rate-limiter';

const app = express();
const PORT = process.env.PORT || 3003;
const SERVICE_NAME = 'user-management';

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

// Setup health checks with real database connections
const checkPostgres = async (): Promise<boolean> => {
  try {
    const pool = getPostgresPool();
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('PostgreSQL health check failed:', error);
    return false;
  }
};

const checkRedis = async (): Promise<boolean> => {
  try {
    const client = await getRedisClient();
    await client.ping();
    return true;
  } catch (error) {
    console.error('Redis health check failed:', error);
    return false;
  }
};

// Add health checks
healthMonitor.addCheck('database', createDatabaseHealthChecker(checkPostgres, 'postgresql'));
healthMonitor.addCheck('redis', createRedisHealthChecker({ ping: checkRedis }, 'redis'));

// Health and metrics routes
app.get('/health', healthMonitor.getHealthEndpoint());

app.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
});

// Authentication routes
app.post('/api/v1/auth/register', 
  createEndpointRateLimiter('auth-register', {
    authenticated: {
      limit: 5, // 5 registrations per minute for authenticated users (unlikely scenario)
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 3, // 3 registrations per minute for anonymous users
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  authController.register.bind(authController)
);

app.post('/api/v1/auth/login', 
  createEndpointRateLimiter('auth-login', {
    authenticated: {
      limit: 10, // 10 login attempts per minute for authenticated users (unlikely scenario)
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 5, // 5 login attempts per minute for anonymous users
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  authController.login.bind(authController)
);

app.post('/api/v1/auth/refresh-token', 
  createEndpointRateLimiter('auth-refresh', {
    authenticated: {
      limit: 20, // 20 token refreshes per minute for authenticated users
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 5, // 5 token refreshes per minute for anonymous users
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  authController.refreshToken.bind(authController)
);

app.get('/api/v1/auth/me', 
  authenticate, 
  createEndpointRateLimiter('auth-me', {
    authenticated: {
      limit: 30, // 30 profile fetches per minute for authenticated users
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 5, // 5 profile fetches per minute for anonymous users (unlikely scenario)
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  authController.getCurrentUser.bind(authController)
);

// Import user controller
import userController from './controllers/userController';

// User profile management routes
app.get('/api/v1/users/profile', 
  authenticate, 
  createEndpointRateLimiter('user-profile-get', {
    authenticated: {
      limit: 30, // 30 profile fetches per minute
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 5, // 5 attempts per minute (should never happen due to authentication)
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  userController.getProfile.bind(userController)
);

app.put('/api/v1/users/profile', 
  authenticate, 
  createEndpointRateLimiter('user-profile-update', {
    authenticated: {
      limit: 10, // 10 profile updates per minute
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 2, // 2 attempts per minute (should never happen due to authentication)
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  userController.updateProfile.bind(userController)
);

app.delete('/api/v1/users/profile', 
  authenticate, 
  createEndpointRateLimiter('user-profile-delete', {
    authenticated: {
      limit: 3, // 3 account deletion attempts per minute
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 1, // 1 attempt per minute (should never happen due to authentication)
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  userController.deleteAccount.bind(userController)
);

app.post('/api/v1/users/verify-email/request', 
  authenticate, 
  createEndpointRateLimiter('email-verification-request', {
    authenticated: {
      limit: 5, // 5 email verification requests per minute
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 2, // 2 attempts per minute (should never happen due to authentication)
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  userController.requestEmailVerification.bind(userController)
);

app.post('/api/v1/users/verify-email', 
  createEndpointRateLimiter('email-verification', {
    authenticated: {
      limit: 10, // 10 verification attempts per minute
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 5, // 5 verification attempts per minute
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  userController.verifyEmail.bind(userController)
);

app.post('/api/v1/users/reset-password/request', 
  createEndpointRateLimiter('password-reset-request', {
    authenticated: {
      limit: 5, // 5 password reset requests per minute
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 3, // 3 password reset requests per minute
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  userController.requestPasswordReset.bind(userController)
);

app.post('/api/v1/users/reset-password', 
  createEndpointRateLimiter('password-reset', {
    authenticated: {
      limit: 5, // 5 password reset attempts per minute
      windowSizeInSeconds: 60,
      headers: true
    },
    anonymous: {
      limit: 3, // 3 password reset attempts per minute
      windowSizeInSeconds: 60,
      headers: true
    }
  }),
  userController.resetPassword.bind(userController)
);

// Error handling middleware
app.use(errorMetricsMiddleware(SERVICE_NAME));

app.listen(PORT, () => {
  console.log(`User Management Service running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Metrics: http://localhost:${PORT}/metrics`);
});