import { Request, Response, NextFunction } from 'express';
import authService from '../services/authService';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        permissions: string[];
      };
    }
  }
}

/**
 * Middleware to authenticate JWT tokens
 */
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: {
          code: 'unauthorized',
          message: 'Authentication required',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }

    // Extract token
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = authService.verifyToken(token);
    
    // Attach user to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      permissions: decoded.permissions
    };
    
    next();
  } catch (error) {
    return res.status(401).json({ 
      error: {
        code: 'invalid_token',
        message: 'Invalid or expired token',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown'
      }
    });
  }
};

/**
 * Middleware to check if user has required permissions
 */
export const authorize = (requiredPermissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          error: {
            code: 'unauthorized',
            message: 'Authentication required',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
      }

      // Check if user has all required permissions
      const hasPermissions = requiredPermissions.every(permission => 
        req.user!.permissions.includes(permission)
      );

      if (!hasPermissions) {
        return res.status(403).json({ 
          error: {
            code: 'forbidden',
            message: 'Insufficient permissions',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({ 
        error: {
          code: 'server_error',
          message: 'Internal server error',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };
};