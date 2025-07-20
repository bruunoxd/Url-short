import { Request, Response } from 'express';
import { UpdateUserSchema, VerifyEmailSchema, RequestPasswordResetSchema, ResetPasswordSchema, DeleteAccountSchema } from '@url-shortener/shared-types';
import userService from '../services/userService';

export class UserController {
  /**
   * Get user profile
   */
  async getProfile(req: Request, res: Response) {
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
      const user = await userService.getUserById(req.user.userId);
      
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
      console.error('Get profile error:', error);
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
   * Update user profile
   */
  async updateProfile(req: Request, res: Response) {
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

      // Validate request body
      const validationResult = UpdateUserSchema.safeParse(req.body);
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

      // Update user
      const updatedUser = await userService.updateUser(req.user.userId, validationResult.data);
      
      // Return updated user data
      res.json(updatedUser.toApiUser());
    } catch (error: any) {
      // Handle specific errors
      if (error.message === 'User not found') {
        return res.status(404).json({
          error: {
            code: 'user_not_found',
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
      }

      if (error.message === 'Email already in use') {
        return res.status(409).json({
          error: {
            code: 'email_conflict',
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
      }

      // Generic error
      console.error('Update profile error:', error);
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
   * Request email verification
   */
  async requestEmailVerification(req: Request, res: Response) {
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

      // Send verification email
      await userService.sendVerificationEmail(req.user.userId);
      
      res.json({
        message: 'Verification email sent successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      // Handle specific errors
      if (error.message === 'User not found') {
        return res.status(404).json({
          error: {
            code: 'user_not_found',
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
      }

      if (error.message === 'Email already verified') {
        return res.status(400).json({
          error: {
            code: 'already_verified',
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
      }

      // Generic error
      console.error('Request email verification error:', error);
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
   * Verify email with token
   */
  async verifyEmail(req: Request, res: Response) {
    try {
      // Validate request body
      const validationResult = VerifyEmailSchema.safeParse(req.body);
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

      // Verify email
      await userService.verifyEmail(validationResult.data.token);
      
      res.json({
        message: 'Email verified successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      // Handle specific errors
      if (error.message === 'Invalid or expired token') {
        return res.status(400).json({
          error: {
            code: 'invalid_token',
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
      }

      // Generic error
      console.error('Verify email error:', error);
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
   * Request password reset
   */
  async requestPasswordReset(req: Request, res: Response) {
    try {
      // Validate request body
      const validationResult = RequestPasswordResetSchema.safeParse(req.body);
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

      // Send password reset email
      await userService.sendPasswordResetEmail(validationResult.data.email);
      
      // Always return success to prevent email enumeration
      res.json({
        message: 'If the email exists in our system, a password reset link has been sent',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      // Always return success to prevent email enumeration
      // But log the error for debugging
      console.error('Request password reset error:', error);
      
      res.json({
        message: 'If the email exists in our system, a password reset link has been sent',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(req: Request, res: Response) {
    try {
      // Validate request body
      const validationResult = ResetPasswordSchema.safeParse(req.body);
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

      // Reset password
      await userService.resetPassword(
        validationResult.data.token,
        validationResult.data.newPassword
      );
      
      res.json({
        message: 'Password reset successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      // Handle specific errors
      if (error.message === 'Invalid or expired token') {
        return res.status(400).json({
          error: {
            code: 'invalid_token',
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
      }

      // Generic error
      console.error('Reset password error:', error);
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
   * Delete user account
   */
  async deleteAccount(req: Request, res: Response) {
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

      // Validate request body
      const validationResult = DeleteAccountSchema.safeParse(req.body);
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

      // Delete account
      await userService.deleteAccount(
        req.user.userId,
        validationResult.data.password
      );
      
      res.json({
        message: 'Account deleted successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      // Handle specific errors
      if (error.message === 'User not found') {
        return res.status(404).json({
          error: {
            code: 'user_not_found',
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
      }

      if (error.message === 'Invalid password') {
        return res.status(401).json({
          error: {
            code: 'invalid_credentials',
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
      }

      // Generic error
      console.error('Delete account error:', error);
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

export default new UserController();