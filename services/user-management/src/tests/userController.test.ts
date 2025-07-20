import { describe, it, expect, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { UserController } from '../controllers/userController';
import userService from '../services/userService';

// Create a mock vi object
const vi = {
  fn: () => {
    const mockFn = (...args: any[]) => mockFn.mock.calls.push(args);
    mockFn.mock = { calls: [], results: [], instances: [] };
    mockFn.mockReturnThis = () => mockFn;
    mockFn.mockReturnValue = (val: any) => {
      mockFn.mock.results.push({ type: 'return', value: val });
      return mockFn;
    };
    mockFn.mockResolvedValue = (val: any) => {
      mockFn.mock.results.push({ type: 'resolve', value: val });
      return mockFn;
    };
    mockFn.mockRejectedValue = (val: any) => {
      mockFn.mock.results.push({ type: 'reject', value: val });
      return mockFn;
    };
    mockFn.mockImplementation = (impl: any) => {
      mockFn.mock.implementation = impl;
      return mockFn;
    };
    return mockFn;
  },
  resetAllMocks: () => {},
  mock: (path: string, factory: any) => {},
  mocked: (obj: any) => obj,
  spyOn: (obj: any, method: string) => vi.fn()
};

// Mock dependencies
vi.mock('../services/userService', () => ({
  default: {
    getUserById: vi.fn(),
    updateUser: vi.fn(),
    sendVerificationEmail: vi.fn(),
    verifyEmail: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    resetPassword: vi.fn(),
    deleteAccount: vi.fn()
  }
}));

describe('UserController', () => {
  let userController: UserController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: vi.Mock;
  let statusMock: vi.Mock;
  
  beforeEach(() => {
    vi.resetAllMocks();
    
    jsonMock = vi.fn().mockReturnThis();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    
    mockRequest = {
      body: {},
      headers: { 'x-request-id': 'test-request-id' }
    };
    
    mockResponse = {
      status: statusMock,
      json: jsonMock
    };
    
    userController = new UserController();
  });
  
  describe('getProfile', () => {
    it('should get user profile successfully', async () => {
      // Mock authenticated request
      mockRequest.user = {
        userId: '123',
        email: 'test@example.com',
        permissions: ['user']
      };
      
      // Mock user entity
      const mockUser = {
        toApiUser: vi.fn().mockReturnValue({
          id: '123',
          email: 'test@example.com',
          name: 'Test User',
          emailVerified: true
        })
      };
      
      // Mock service
      vi.mocked(userService.getUserById).mockResolvedValue(mockUser as any);
      
      // Call the method
      await userController.getProfile(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(userService.getUserById).toHaveBeenCalledWith('123');
      expect(jsonMock).toHaveBeenCalledWith({
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: true
      });
    });
    
    it('should return error if not authenticated', async () => {
      // Mock unauthenticated request
      mockRequest.user = undefined;
      
      // Call the method
      await userController.getProfile(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(userService.getUserById).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'unauthorized'
        })
      }));
    });
    
    it('should return error if user not found', async () => {
      // Mock authenticated request
      mockRequest.user = {
        userId: '123',
        email: 'test@example.com',
        permissions: ['user']
      };
      
      // Mock service
      vi.mocked(userService.getUserById).mockResolvedValue(null);
      
      // Call the method
      await userController.getProfile(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'user_not_found'
        })
      }));
    });
  });
  
  describe('updateProfile', () => {
    it('should update user profile successfully', async () => {
      // Mock authenticated request
      mockRequest.user = {
        userId: '123',
        email: 'test@example.com',
        permissions: ['user']
      };
      
      // Mock request data
      mockRequest.body = {
        name: 'Updated Name',
        email: 'updated@example.com'
      };
      
      // Mock user entity
      const mockUser = {
        toApiUser: vi.fn().mockReturnValue({
          id: '123',
          email: 'updated@example.com',
          name: 'Updated Name',
          emailVerified: true
        })
      };
      
      // Mock service
      vi.mocked(userService.updateUser).mockResolvedValue(mockUser as any);
      
      // Call the method
      await userController.updateProfile(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(userService.updateUser).toHaveBeenCalledWith('123', {
        name: 'Updated Name',
        email: 'updated@example.com'
      });
      expect(jsonMock).toHaveBeenCalledWith({
        id: '123',
        email: 'updated@example.com',
        name: 'Updated Name',
        emailVerified: true
      });
    });
    
    it('should return validation error for invalid data', async () => {
      // Mock authenticated request
      mockRequest.user = {
        userId: '123',
        email: 'test@example.com',
        permissions: ['user']
      };
      
      // Mock request with invalid data
      mockRequest.body = {
        email: 'invalid-email'
      };
      
      // Call the method
      await userController.updateProfile(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(userService.updateUser).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'validation_error'
        })
      }));
    });
    
    it('should handle email conflict error', async () => {
      // Mock authenticated request
      mockRequest.user = {
        userId: '123',
        email: 'test@example.com',
        permissions: ['user']
      };
      
      // Mock request data
      mockRequest.body = {
        email: 'existing@example.com'
      };
      
      // Mock service error
      vi.mocked(userService.updateUser).mockRejectedValue(new Error('Email already in use'));
      
      // Call the method
      await userController.updateProfile(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'email_conflict',
          message: 'Email already in use'
        })
      }));
    });
  });
  
  describe('requestEmailVerification', () => {
    it('should request email verification successfully', async () => {
      // Mock authenticated request
      mockRequest.user = {
        userId: '123',
        email: 'test@example.com',
        permissions: ['user']
      };
      
      // Mock service
      vi.mocked(userService.sendVerificationEmail).mockResolvedValue(undefined);
      
      // Call the method
      await userController.requestEmailVerification(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(userService.sendVerificationEmail).toHaveBeenCalledWith('123');
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Verification email sent successfully'
      }));
    });
    
    it('should handle already verified error', async () => {
      // Mock authenticated request
      mockRequest.user = {
        userId: '123',
        email: 'test@example.com',
        permissions: ['user']
      };
      
      // Mock service error
      vi.mocked(userService.sendVerificationEmail).mockRejectedValue(new Error('Email already verified'));
      
      // Call the method
      await userController.requestEmailVerification(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'already_verified',
          message: 'Email already verified'
        })
      }));
    });
  });
  
  describe('verifyEmail', () => {
    it('should verify email successfully', async () => {
      // Mock request data
      mockRequest.body = {
        token: 'valid-token'
      };
      
      // Mock service
      vi.mocked(userService.verifyEmail).mockResolvedValue(undefined);
      
      // Call the method
      await userController.verifyEmail(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(userService.verifyEmail).toHaveBeenCalledWith('valid-token');
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Email verified successfully'
      }));
    });
    
    it('should handle invalid token error', async () => {
      // Mock request data
      mockRequest.body = {
        token: 'invalid-token'
      };
      
      // Mock service error
      vi.mocked(userService.verifyEmail).mockRejectedValue(new Error('Invalid or expired token'));
      
      // Call the method
      await userController.verifyEmail(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'invalid_token',
          message: 'Invalid or expired token'
        })
      }));
    });
  });
  
  describe('requestPasswordReset', () => {
    it('should request password reset successfully', async () => {
      // Mock request data
      mockRequest.body = {
        email: 'test@example.com'
      };
      
      // Mock service
      vi.mocked(userService.sendPasswordResetEmail).mockResolvedValue(undefined);
      
      // Call the method
      await userController.requestPasswordReset(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(userService.sendPasswordResetEmail).toHaveBeenCalledWith('test@example.com');
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'If the email exists in our system, a password reset link has been sent'
      }));
    });
    
    it('should return same response even if email does not exist (prevent enumeration)', async () => {
      // Mock request data
      mockRequest.body = {
        email: 'nonexistent@example.com'
      };
      
      // Mock service error
      vi.mocked(userService.sendPasswordResetEmail).mockRejectedValue(new Error('User not found'));
      
      // Call the method
      await userController.requestPasswordReset(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'If the email exists in our system, a password reset link has been sent'
      }));
    });
  });
  
  describe('resetPassword', () => {
    it('should reset password successfully', async () => {
      // Mock request data
      mockRequest.body = {
        token: 'valid-token',
        newPassword: 'newPassword123'
      };
      
      // Mock service
      vi.mocked(userService.resetPassword).mockResolvedValue(undefined);
      
      // Call the method
      await userController.resetPassword(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(userService.resetPassword).toHaveBeenCalledWith('valid-token', 'newPassword123');
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Password reset successfully'
      }));
    });
    
    it('should handle invalid token error', async () => {
      // Mock request data
      mockRequest.body = {
        token: 'invalid-token',
        newPassword: 'newPassword123'
      };
      
      // Mock service error
      vi.mocked(userService.resetPassword).mockRejectedValue(new Error('Invalid or expired token'));
      
      // Call the method
      await userController.resetPassword(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'invalid_token',
          message: 'Invalid or expired token'
        })
      }));
    });
  });
  
  describe('deleteAccount', () => {
    it('should delete account successfully', async () => {
      // Mock authenticated request
      mockRequest.user = {
        userId: '123',
        email: 'test@example.com',
        permissions: ['user']
      };
      
      // Mock request data
      mockRequest.body = {
        password: 'correct_password'
      };
      
      // Mock service
      vi.mocked(userService.deleteAccount).mockResolvedValue(undefined);
      
      // Call the method
      await userController.deleteAccount(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(userService.deleteAccount).toHaveBeenCalledWith('123', 'correct_password');
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Account deleted successfully'
      }));
    });
    
    it('should return error if not authenticated', async () => {
      // Mock unauthenticated request
      mockRequest.user = undefined;
      
      // Call the method
      await userController.deleteAccount(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(userService.deleteAccount).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'unauthorized'
        })
      }));
    });
    
    it('should return validation error for missing password', async () => {
      // Mock authenticated request
      mockRequest.user = {
        userId: '123',
        email: 'test@example.com',
        permissions: ['user']
      };
      
      // Mock request with missing password
      mockRequest.body = {};
      
      // Call the method
      await userController.deleteAccount(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(userService.deleteAccount).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'validation_error'
        })
      }));
    });
    
    it('should handle invalid password error', async () => {
      // Mock authenticated request
      mockRequest.user = {
        userId: '123',
        email: 'test@example.com',
        permissions: ['user']
      };
      
      // Mock request data
      mockRequest.body = {
        password: 'wrong_password'
      };
      
      // Mock service error
      vi.mocked(userService.deleteAccount).mockRejectedValue(new Error('Invalid password'));
      
      // Call the method
      await userController.deleteAccount(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'invalid_credentials',
          message: 'Invalid password'
        })
      }));
    });
    
    it('should handle user not found error', async () => {
      // Mock authenticated request
      mockRequest.user = {
        userId: '123',
        email: 'test@example.com',
        permissions: ['user']
      };
      
      // Mock request data
      mockRequest.body = {
        password: 'correct_password'
      };
      
      // Mock service error
      vi.mocked(userService.deleteAccount).mockRejectedValue(new Error('User not found'));
      
      // Call the method
      await userController.deleteAccount(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'user_not_found',
          message: 'User not found'
        })
      }));
    });
  });
});