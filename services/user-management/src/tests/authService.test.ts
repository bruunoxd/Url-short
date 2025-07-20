import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/authService';
import { UserEntity } from '@url-shortener/shared-db';

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
vi.mock('bcrypt');
vi.mock('jsonwebtoken');
vi.mock('@url-shortener/shared-db', () => ({
  UserEntity: {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn()
  }
}));

describe('AuthService', () => {
  let authService: AuthService;
  
  beforeEach(() => {
    vi.resetAllMocks();
    authService = new AuthService();
  });
  
  describe('register', () => {
    it('should register a new user successfully', async () => {
      // Mock dependencies
      const mockUser = new UserEntity({
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hashed_password'
      });
      
      vi.mocked(UserEntity.findByEmail).mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed_password' as never);
      vi.mocked(UserEntity.create).mockResolvedValue(mockUser);
      
      // Call the method
      const result = await authService.register({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      });
      
      // Assertions
      expect(UserEntity.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
      expect(UserEntity.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        passwordHash: 'hashed_password',
        name: 'Test User'
      });
      expect(result).toBe(mockUser);
    });
    
    it('should throw an error if user already exists', async () => {
      // Mock dependencies
      const existingUser = new UserEntity({
        id: '123',
        email: 'test@example.com'
      });
      
      vi.mocked(UserEntity.findByEmail).mockResolvedValue(existingUser);
      
      // Call the method and expect error
      await expect(authService.register({
        email: 'test@example.com',
        password: 'password123'
      })).rejects.toThrow('User with this email already exists');
      
      // Assertions
      expect(UserEntity.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(UserEntity.create).not.toHaveBeenCalled();
    });
  });
  
  describe('login', () => {
    it('should login user and return tokens', async () => {
      // Mock dependencies
      const mockUser = new UserEntity({
        id: '123',
        email: 'test@example.com',
        passwordHash: 'hashed_password',
        isActive: true
      });
      
      const mockTokens = {
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        expiresIn: 3600
      };
      
      vi.mocked(UserEntity.findByEmail).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      
      // Mock generateTokens method
      const generateTokensSpy = vi.spyOn(authService, 'generateTokens').mockReturnValue(mockTokens);
      
      // Call the method
      const result = await authService.login({
        email: 'test@example.com',
        password: 'password123'
      });
      
      // Assertions
      expect(UserEntity.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashed_password');
      expect(generateTokensSpy).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual(mockTokens);
    });
    
    it('should throw an error if user not found', async () => {
      // Mock dependencies
      vi.mocked(UserEntity.findByEmail).mockResolvedValue(null);
      
      // Call the method and expect error
      await expect(authService.login({
        email: 'test@example.com',
        password: 'password123'
      })).rejects.toThrow('Invalid email or password');
      
      // Assertions
      expect(UserEntity.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
    
    it('should throw an error if user is inactive', async () => {
      // Mock dependencies
      const mockUser = new UserEntity({
        id: '123',
        email: 'test@example.com',
        passwordHash: 'hashed_password',
        isActive: false
      });
      
      vi.mocked(UserEntity.findByEmail).mockResolvedValue(mockUser);
      
      // Call the method and expect error
      await expect(authService.login({
        email: 'test@example.com',
        password: 'password123'
      })).rejects.toThrow('Account is disabled');
      
      // Assertions
      expect(UserEntity.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
    
    it('should throw an error if password is invalid', async () => {
      // Mock dependencies
      const mockUser = new UserEntity({
        id: '123',
        email: 'test@example.com',
        passwordHash: 'hashed_password',
        isActive: true
      });
      
      vi.mocked(UserEntity.findByEmail).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
      
      // Call the method and expect error
      await expect(authService.login({
        email: 'test@example.com',
        password: 'wrong_password'
      })).rejects.toThrow('Invalid email or password');
      
      // Assertions
      expect(UserEntity.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(bcrypt.compare).toHaveBeenCalledWith('wrong_password', 'hashed_password');
    });
  });
  
  describe('generateTokens', () => {
    it('should generate access and refresh tokens', () => {
      // Mock dependencies
      const mockUser = new UserEntity({
        id: '123',
        email: 'test@example.com'
      });
      
      vi.mocked(jwt.sign).mockReturnValueOnce('access_token' as never);
      vi.mocked(jwt.sign).mockReturnValueOnce('refresh_token' as never);
      vi.mocked(jwt.decode).mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 } as never);
      
      // Call the method
      const result = authService.generateTokens(mockUser);
      
      // Assertions
      expect(jwt.sign).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        expiresIn: 3600
      });
    });
  });
  
  describe('verifyToken', () => {
    it('should verify and return token payload', () => {
      // Mock dependencies
      const mockPayload = {
        userId: '123',
        email: 'test@example.com',
        permissions: ['user'],
        iat: 1000,
        exp: 2000
      };
      
      vi.mocked(jwt.verify).mockReturnValue(mockPayload as never);
      
      // Call the method
      const result = authService.verifyToken('valid_token');
      
      // Assertions
      expect(jwt.verify).toHaveBeenCalledWith('valid_token', expect.any(String));
      expect(result).toEqual(mockPayload);
    });
    
    it('should throw an error if token is invalid', () => {
      // Mock dependencies
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new Error('Invalid token');
      });
      
      // Call the method and expect error
      expect(() => authService.verifyToken('invalid_token')).toThrow('Invalid or expired token');
      
      // Assertions
      expect(jwt.verify).toHaveBeenCalledWith('invalid_token', expect.any(String));
    });
  });
  
  describe('refreshToken', () => {
    it('should refresh token and return new tokens', async () => {
      // Mock dependencies
      const mockUser = new UserEntity({
        id: '123',
        email: 'test@example.com',
        isActive: true
      });
      
      const mockTokens = {
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
        expiresIn: 3600
      };
      
      vi.mocked(jwt.verify).mockReturnValue({ userId: '123' } as never);
      vi.mocked(UserEntity.findById).mockResolvedValue(mockUser);
      
      // Mock generateTokens method
      const generateTokensSpy = vi.spyOn(authService, 'generateTokens').mockReturnValue(mockTokens);
      
      // Call the method
      const result = await authService.refreshToken('valid_refresh_token');
      
      // Assertions
      expect(jwt.verify).toHaveBeenCalledWith('valid_refresh_token', expect.any(String));
      expect(UserEntity.findById).toHaveBeenCalledWith('123');
      expect(generateTokensSpy).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual(mockTokens);
    });
    
    it('should throw an error if refresh token is invalid', async () => {
      // Mock dependencies
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new Error('Invalid token');
      });
      
      // Call the method and expect error
      await expect(authService.refreshToken('invalid_refresh_token')).rejects.toThrow('Invalid or expired refresh token');
      
      // Assertions
      expect(jwt.verify).toHaveBeenCalledWith('invalid_refresh_token', expect.any(String));
      expect(UserEntity.findById).not.toHaveBeenCalled();
    });
    
    it('should throw an error if user not found or inactive', async () => {
      // Mock dependencies
      vi.mocked(jwt.verify).mockReturnValue({ userId: '123' } as never);
      vi.mocked(UserEntity.findById).mockResolvedValue(null);
      
      // Call the method and expect error
      await expect(authService.refreshToken('valid_refresh_token')).rejects.toThrow('Invalid token or user not found');
      
      // Assertions
      expect(jwt.verify).toHaveBeenCalledWith('valid_refresh_token', expect.any(String));
      expect(UserEntity.findById).toHaveBeenCalledWith('123');
    });
  });
  
  describe('getUserById', () => {
    it('should return user by ID', async () => {
      // Mock dependencies
      const mockUser = new UserEntity({
        id: '123',
        email: 'test@example.com'
      });
      
      vi.mocked(UserEntity.findById).mockResolvedValue(mockUser);
      
      // Call the method
      const result = await authService.getUserById('123');
      
      // Assertions
      expect(UserEntity.findById).toHaveBeenCalledWith('123');
      expect(result).toBe(mockUser);
    });
    
    it('should return null if user not found', async () => {
      // Mock dependencies
      vi.mocked(UserEntity.findById).mockResolvedValue(null);
      
      // Call the method
      const result = await authService.getUserById('123');
      
      // Assertions
      expect(UserEntity.findById).toHaveBeenCalledWith('123');
      expect(result).toBeNull();
    });
  });
});