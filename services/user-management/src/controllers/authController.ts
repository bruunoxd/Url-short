import { Request, Response } from 'express';
import { RegisterSchema, LoginSchema } from '@url-shortener/shared-types';
import authService from '../services/authService';

export class AuthController {
  /**
   * Register a new user
   */
  async register(req: Request, res: Response) {
    try {
      // Validate request body
      const validationResult = RegisterSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: {
            code: 'validation_error',
            message: 'Invalid request data',
            details: validationResult.error.format(),
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
      }

      // Register user
      const user = await authService.register(validationResult.data);
      
      // Return user data (without password)
      res.status(201).json(user.toApiUser());
    } catch (error: any) {
      // Handle specific errors
      if (error.message === 'User with this email already exists') {
        return res.status(409).json({
          error: {
            code: 'user_exists',
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
      }

      // Generic error
      console.error('Registration error:', error);
      res.status(500).json({
        error: {
          code: 'server_error',
          message: 'Internal server error',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }

  /**
   * Login user
   */
  async login(req: Request, res: Response) {
    try {
      // Validate request body
      const validationResult = LoginSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: {
            code: 'validation_error',
            message: 'Invalid request data',
            details: validationResult.error.format(),
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
      }

      // Login user
      const tokens = await authService.login(validationResult.data);
      
      // Return tokens
      res.json(tokens);
    } catch (error: any) {
      // Handle specific errors
      if (error.message === 'Invalid email or password' || error.message === 'Account is disabled') {
        return res.status(401).json({
          error: {
            code: 'authentication_failed',
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
      }

      // Generic error
      console.error('Login error:', error);
      res.status(500).json({
        error: {
          code: 'server_error',
          message: 'Internal server error',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({
          error: {
            code: 'invalid_request',
            message: 'Refresh token is required',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
      }

      // Refresh token
      const tokens = await authService.refreshToken(refreshToken);
      
      // Return new tokens
      res.json(tokens);
    } catch (error: any) {
      res.status(401).json({
        error: {
          code: 'invalid_token',
          message: 'Invalid or expired refresh token',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }

  /**
   * Get current user info
   */
  async getCurrentUser(req: Request, res: Response) {
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

      // Get user from database
      const user = await authService.getUserById(req.user.userId);
      
      if (!user) {
        return res.status(404).json({
          error: {
            code: 'user_not_found',
            message: 'User not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
      }

      // Return user data
      res.json(user.toApiUser());
    } catch (error) {
      console.error('Get current user error:', error);
      res.status(500).json({
        error: {
          code: 'server_error',
          message: 'Internal server error',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
}

export default new AuthController();