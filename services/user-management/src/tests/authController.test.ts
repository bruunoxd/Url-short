import { describe, it, expect, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { AuthController } from '../controllers/authController';
import authService from '../services/authService';

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
vi.mock('../services/authService', () => ({
  default: {
    register: vi.fn(),
    login: vi.fn(),
    refreshToken: vi.fn(),
    getUserById: vi.fn()
  }
}));

describe('AuthController', () => {
  let authController: AuthController;
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
    
    authController = new AuthController();
  });
  
  describe('register', () => {
    it('should register a user successfully', async () => {
      // Mock request data
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      };
      
      // Mock user entity
      const mockUser = {
        toApiUser: vi.fn().mockReturnValue({
          id: '123',
          email: 'test@example.com',
          name: 'Test User'
        })
      };
      
      // Mock service
      vi.mocked(authService.register).mockResolvedValue(mockUser as any);
      
      // Call the method
      await authController.register(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(authService.register).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      });
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({
        id: '123',
        email: 'test@example.com',
        name: 'Test User'
      });
    });
    
    it('should return validation error for invalid data', async () => {
      // Mock request with invalid data
      mockRequest.body = {
        email: 'invalid-email',
        password: '123' // Too short
      };
      
      // Call the method
      await authController.register(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(authService.register).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'validation_error'
        })
      }));
    });
    
    it('should handle duplicate user error', async () => {
      // Mock request data
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123'
      };
      
      // Mock service error
      vi.mocked(authService.register).mockRejectedValue(new Error('User with this email already exists'));
      
      // Call the method
      await authController.register(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'user_exists',
          message: 'User with this email already exists'
        })
      }));
    });
    
    it('should handle generic errors', async () => {
      // Mock request data
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123'
      };
      
      // Mock service error
      vi.mocked(authService.register).mockRejectedValue(new Error('Database error'));
      
      // Call the method
      await authController.register(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'server_error'
        })
      }));
    });
  });
  
  describe('login', () => {
    it('should login user successfully', async () => {
      // Mock request data
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123'
      };
      
      // Mock tokens
      const mockTokens = {
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        expiresIn: 3600
      };
      
      // Mock service
      vi.mocked(authService.login).mockResolvedValue(mockTokens);
      
      // Call the method
      await authController.login(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(authService.login).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123'
      });
      expect(jsonMock).toHaveBeenCalledWith(mockTokens);
    });
    
    it('should return validation error for invalid data', async () => {
      // Mock request with invalid data
      mockRequest.body = {
        email: 'invalid-email'
        // Missing password
      };
      
      // Call the method
      await authController.login(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(authService.login).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'validation_error'
        })
      }));
    });
    
    it('should handle authentication errors', async () => {
      // Mock request data
      mockRequest.body = {
        email: 'test@example.com',
        password: 'wrong_password'
      };
      
      // Mock service error
      vi.mocked(authService.login).mockRejectedValue(new Error('Invalid email or password'));
      
      // Call the method
      await authController.login(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'authentication_failed',
          message: 'Invalid email or password'
        })
      }));
    });
    
    it('should handle generic errors', async () => {
      // Mock request data
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123'
      };
      
      // Mock service error
      vi.mocked(authService.login).mockRejectedValue(new Error('Database error'));
      
      // Call the method
      await authController.login(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'server_error'
        })
      }));
    });
  });
  
  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      // Mock request data
      mockRequest.body = {
        refreshToken: 'valid_refresh_token'
      };
      
      // Mock tokens
      const mockTokens = {
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
        expiresIn: 3600
      };
      
      // Mock service
      vi.mocked(authService.refreshToken).mockResolvedValue(mockTokens);
      
      // Call the method
      await authController.refreshToken(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(authService.refreshToken).toHaveBeenCalledWith('valid_refresh_token');
      expect(jsonMock).toHaveBeenCalledWith(mockTokens);
    });
    
    it('should return error if refresh token is missing', async () => {
      // Mock request with missing token
      mockRequest.body = {};
      
      // Call the method
      await authController.refreshToken(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(authService.refreshToken).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'invalid_request',
          message: 'Refresh token is required'
        })
      }));
    });
    
    it('should handle invalid refresh token error', async () => {
      // Mock request data
      mockRequest.body = {
        refreshToken: 'invalid_refresh_token'
      };
      
      // Mock service error
      vi.mocked(authService.refreshToken).mockRejectedValue(new Error('Invalid or expired refresh token'));
      
      // Call the method
      await authController.refreshToken(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'invalid_token'
        })
      }));
    });
  });
  
  describe('getCurrentUser', () => {
    it('should return current user data', async () => {
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
          name: 'Test User'
        })
      };
      
      // Mock service
      vi.mocked(authService.getUserById).mockResolvedValue(mockUser as any);
      
      // Call the method
      await authController.getCurrentUser(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(authService.getUserById).toHaveBeenCalledWith('123');
      expect(jsonMock).toHaveBeenCalledWith({
        id: '123',
        email: 'test@example.com',
        name: 'Test User'
      });
    });
    
    it('should return error if not authenticated', async () => {
      // Mock unauthenticated request
      mockRequest.user = undefined;
      
      // Call the method
      await authController.getCurrentUser(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(authService.getUserById).not.toHaveBeenCalled();
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
      vi.mocked(authService.getUserById).mockResolvedValue(null);
      
      // Call the method
      await authController.getCurrentUser(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'user_not_found'
        })
      }));
    });
    
    it('should handle generic errors', async () => {
      // Mock authenticated request
      mockRequest.user = {
        userId: '123',
        email: 'test@example.com',
        permissions: ['user']
      };
      
      // Mock service error
      vi.mocked(authService.getUserById).mockRejectedValue(new Error('Database error'));
      
      // Call the method
      await authController.getCurrentUser(mockRequest as Request, mockResponse as Response);
      
      // Assertions
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'server_error'
        })
      }));
    });
  });
});