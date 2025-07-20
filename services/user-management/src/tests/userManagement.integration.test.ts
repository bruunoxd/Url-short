import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { UserEntity } from '@url-shortener/shared-db';
import userService from '../services/userService';
import userController from '../controllers/userController';
import { authenticate } from '../middleware/authMiddleware';

// Mock dependencies
vi.mock('@url-shortener/shared-db', () => {
  const mockUserEntity = {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    create: vi.fn(),
    fromDb: vi.fn(),
    prototype: {
      update: vi.fn(),
      delete: vi.fn(),
      toApiUser: vi.fn()
    }
  };
  
  return {
    UserEntity: mockUserEntity,
    getRedisClient: vi.fn().mockReturnValue({
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      keys: vi.fn().mockResolvedValue([]),
      ping: vi.fn()
    }),
    getPostgresPool: vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn()
      })
    }),
    executeQuery: vi.fn()
  };
});

vi.mock('bcrypt', () => ({
  hash: vi.fn().mockResolvedValue('hashed_password'),
  compare: vi.fn().mockResolvedValue(true)
}));

vi.mock('jsonwebtoken', () => ({
  sign: vi.fn().mockReturnValue('mock_token'),
  verify: vi.fn().mockImplementation((token, secret) => {
    if (token === 'valid_token') {
      return { userId: 'user123', email: 'test@example.com', permissions: ['user'] };
    }
    throw new Error('Invalid token');
  })
}));

describe('User Management Integration Tests', () => {
  let app: express.Application;
  const mockUser = {
    id: 'user123',
    email: 'test@example.com',
    name: 'Test User',
    passwordHash: 'hashed_password',
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: true,
    emailVerified: false,
    update: vi.fn().mockImplementation(function(this: any, updates: any) {
      Object.assign(this, updates);
      return this;
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    toApiUser: vi.fn().mockReturnValue({
      id: 'user123',
      email: 'test@example.com',
      name: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      emailVerified: false
    })
  };
  
  beforeAll(() => {
    app = express();
    app.use(express.json());
    
    // Setup routes for testing
    app.get('/api/v1/users/profile', authenticate, userController.getProfile.bind(userController));
    app.put('/api/v1/users/profile', authenticate, userController.updateProfile.bind(userController));
    app.delete('/api/v1/users/profile', authenticate, userController.deleteAccount.bind(userController));
    app.post('/api/v1/users/verify-email/request', authenticate, userController.requestEmailVerification.bind(userController));
    app.post('/api/v1/users/verify-email', userController.verifyEmail.bind(userController));
    app.post('/api/v1/users/reset-password/request', userController.requestPasswordReset.bind(userController));
    app.post('/api/v1/users/reset-password', userController.resetPassword.bind(userController));
  });
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mocks
    vi.mocked(UserEntity.findById).mockResolvedValue(mockUser as any);
    vi.mocked(UserEntity.findByEmail).mockResolvedValue(mockUser as any);
  });
  
  describe('GET /api/v1/users/profile', () => {
    it('should return user profile when authenticated', async () => {
      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', 'Bearer valid_token');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockUser.toApiUser());
      expect(UserEntity.findById).toHaveBeenCalledWith('user123');
    });
    
    it('should return 401 when not authenticated', async () => {
      const response = await request(app)
        .get('/api/v1/users/profile');
      
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('unauthorized');
    });
    
    it('should return 404 when user not found', async () => {
      vi.mocked(UserEntity.findById).mockResolvedValueOnce(null);
      
      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', 'Bearer valid_token');
      
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('user_not_found');
    });
  });
  
  describe('PUT /api/v1/users/profile', () => {
    it('should update user profile successfully', async () => {
      const updatedUser = {
        ...mockUser,
        name: 'Updated Name',
        email: 'updated@example.com'
      };
      
      vi.mocked(mockUser.update).mockResolvedValueOnce(updatedUser as any);
      vi.mocked(mockUser.toApiUser).mockReturnValueOnce({
        id: 'user123',
        email: 'updated@example.com',
        name: 'Updated Name',
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
        isActive: true,
        emailVerified: false
      });
      
      const response = await request(app)
        .put('/api/v1/users/profile')
        .set('Authorization', 'Bearer valid_token')
        .send({
          name: 'Updated Name',
          email: 'updated@example.com'
        });
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 'user123',
        email: 'updated@example.com',
        name: 'Updated Name',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        isActive: true,
        emailVerified: false
      });
      expect(mockUser.update).toHaveBeenCalledWith({
        name: 'Updated Name',
        email: 'updated@example.com'
      });
    });
    
    it('should return 400 for invalid data', async () => {
      const response = await request(app)
        .put('/api/v1/users/profile')
        .set('Authorization', 'Bearer valid_token')
        .send({
          email: 'invalid-email'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('validation_error');
    });
    
    it('should return 409 when email is already in use', async () => {
      vi.mocked(mockUser.update).mockRejectedValueOnce(new Error('Email already in use'));
      
      const response = await request(app)
        .put('/api/v1/users/profile')
        .set('Authorization', 'Bearer valid_token')
        .send({
          email: 'existing@example.com'
        });
      
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('email_conflict');
    });
  });
  
  describe('DELETE /api/v1/users/profile', () => {
    it('should delete user account successfully', async () => {
      const response = await request(app)
        .delete('/api/v1/users/profile')
        .set('Authorization', 'Bearer valid_token')
        .send({
          password: 'correct_password'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Account deleted successfully');
      expect(mockUser.delete).toHaveBeenCalled();
    });
    
    it('should return 401 for invalid password', async () => {
      vi.mocked(bcrypt.compare).mockResolvedValueOnce(false);
      
      const response = await request(app)
        .delete('/api/v1/users/profile')
        .set('Authorization', 'Bearer valid_token')
        .send({
          password: 'wrong_password'
        });
      
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('invalid_credentials');
    });
    
    it('should return 400 for missing password', async () => {
      const response = await request(app)
        .delete('/api/v1/users/profile')
        .set('Authorization', 'Bearer valid_token')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('validation_error');
    });
  });
  
  describe('POST /api/v1/users/verify-email/request', () => {
    it('should request email verification successfully', async () => {
      const response = await request(app)
        .post('/api/v1/users/verify-email/request')
        .set('Authorization', 'Bearer valid_token');
      
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Verification email sent successfully');
    });
    
    it('should return 400 if email already verified', async () => {
      vi.spyOn(userService, 'sendVerificationEmail').mockRejectedValueOnce(new Error('Email already verified'));
      
      const response = await request(app)
        .post('/api/v1/users/verify-email/request')
        .set('Authorization', 'Bearer valid_token');
      
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('already_verified');
    });
  });
  
  describe('POST /api/v1/users/verify-email', () => {
    it('should verify email successfully', async () => {
      vi.spyOn(userService, 'verifyEmail').mockResolvedValueOnce(undefined);
      
      const response = await request(app)
        .post('/api/v1/users/verify-email')
        .send({
          token: 'valid_verification_token'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Email verified successfully');
      expect(userService.verifyEmail).toHaveBeenCalledWith('valid_verification_token');
    });
    
    it('should return 400 for invalid token', async () => {
      vi.spyOn(userService, 'verifyEmail').mockRejectedValueOnce(new Error('Invalid or expired token'));
      
      const response = await request(app)
        .post('/api/v1/users/verify-email')
        .send({
          token: 'invalid_token'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('invalid_token');
    });
  });
  
  describe('POST /api/v1/users/reset-password/request', () => {
    it('should request password reset successfully', async () => {
      vi.spyOn(userService, 'sendPasswordResetEmail').mockResolvedValueOnce(undefined);
      
      const response = await request(app)
        .post('/api/v1/users/reset-password/request')
        .send({
          email: 'test@example.com'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('If the email exists in our system, a password reset link has been sent');
      expect(userService.sendPasswordResetEmail).toHaveBeenCalledWith('test@example.com');
    });
    
    it('should return same response even if email does not exist', async () => {
      vi.spyOn(userService, 'sendPasswordResetEmail').mockRejectedValueOnce(new Error('User not found'));
      
      const response = await request(app)
        .post('/api/v1/users/reset-password/request')
        .send({
          email: 'nonexistent@example.com'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('If the email exists in our system, a password reset link has been sent');
    });
  });
  
  describe('POST /api/v1/users/reset-password', () => {
    it('should reset password successfully', async () => {
      vi.spyOn(userService, 'resetPassword').mockResolvedValueOnce(undefined);
      
      const response = await request(app)
        .post('/api/v1/users/reset-password')
        .send({
          token: 'valid_reset_token',
          newPassword: 'newPassword123'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Password reset successfully');
      expect(userService.resetPassword).toHaveBeenCalledWith('valid_reset_token', 'newPassword123');
    });
    
    it('should return 400 for invalid token', async () => {
      vi.spyOn(userService, 'resetPassword').mockRejectedValueOnce(new Error('Invalid or expired token'));
      
      const response = await request(app)
        .post('/api/v1/users/reset-password')
        .send({
          token: 'invalid_token',
          newPassword: 'newPassword123'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('invalid_token');
    });
    
    it('should return 400 for invalid password format', async () => {
      const response = await request(app)
        .post('/api/v1/users/reset-password')
        .send({
          token: 'valid_token',
          newPassword: 'short'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('validation_error');
    });
  });
});