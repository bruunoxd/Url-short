import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { UserEntity } from '@url-shortener/shared-db';
import { authController } from '../controllers/authController';
import { authMiddleware } from '../middleware/authMiddleware';

// Mock shared-db module
vi.mock('@url-shortener/shared-db', () => ({
  UserEntity: {
    findByEmail: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
  }
}));

// Mock environment variables
vi.mock('process', () => ({
  env: {
    JWT_SECRET: 'test-secret',
    JWT_EXPIRY: '1h',
    NODE_ENV: 'test',
  }
}));

describe('Authentication Security Tests', () => {
  let app: express.Application;
  
  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Setup routes
    app.post('/api/v1/auth/login', authController.login);
    app.post('/api/v1/auth/register', authController.register);
    app.post('/api/v1/auth/refresh-token', authController.refreshToken);
    
    // Protected route for testing
    app.get('/api/v1/protected', authMiddleware, (req, res) => {
      res.json({ success: true, user: (req as any).user });
    });
    
    // Reset mocks
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('Password Security', () => {
    it('should store passwords using bcrypt with appropriate cost factor', async () => {
      // Setup
      const userData = {
        email: 'test@example.com',
        password: 'SecurePassword123!',
        name: 'Test User',
      };
      
      // Mock user creation
      (UserEntity.findByEmail as any).mockResolvedValue(null);
      (UserEntity.create as any).mockImplementation(async (data) => {
        return {
          id: '123',
          email: data.email,
          name: data.name,
          passwordHash: data.passwordHash,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          toApiUser: () => ({
            id: '123',
            email: data.email,
            name: data.name,
            isActive: true,
          }),
        };
      });
      
      // Execute
      await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);
      
      // Verify
      expect(UserEntity.create).toHaveBeenCalled();
      const createCall = (UserEntity.create as any).mock.calls[0][0];
      
      // Verify password was hashed
      expect(createCall.passwordHash).not.toBe(userData.password);
      
      // Verify bcrypt was used with appropriate cost factor
      expect(createCall.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/); // bcrypt hash pattern
      
      // Extract cost factor from hash
      const costFactor = parseInt(createCall.passwordHash.split('$')[2]);
      expect(costFactor).toBeGreaterThanOrEqual(12); // Cost factor should be at least 12
      
      // Verify the hash is valid and can be verified
      const isValid = await bcrypt.compare(userData.password, createCall.passwordHash);
      expect(isValid).toBe(true);
    });
    
    it('should reject weak passwords', async () => {
      // Test various weak passwords
      const weakPasswords = [
        'password',
        '12345678',
        'qwerty',
        'abcdef',
        'test123',
      ];
      
      for (const weakPassword of weakPasswords) {
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send({
            email: 'test@example.com',
            password: weakPassword,
            name: 'Test User',
          });
        
        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
        expect(response.body.error.message).toMatch(/password/i);
      }
    });
  });
  
  describe('JWT Security', () => {
    it('should generate secure JWT tokens with appropriate expiry', async () => {
      // Setup
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        passwordHash: await bcrypt.hash('SecurePassword123!', 12),
        name: 'Test User',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        toApiUser: () => ({
          id: '123',
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
        }),
      };
      
      (UserEntity.findByEmail as any).mockResolvedValue(mockUser);
      
      // Execute
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!',
        })
        .expect(200);
      
      // Verify token exists
      expect(response.body.data.token).toBeDefined();
      
      // Decode token to verify claims
      const decoded = jwt.verify(response.body.data.token, 'test-secret') as any;
      
      // Verify token contains appropriate claims
      expect(decoded.userId).toBe('123');
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
      
      // Verify token expiry (should be 1 hour from now)
      const expiryTime = decoded.exp - decoded.iat;
      expect(expiryTime).toBe(3600); // 1 hour in seconds
    });
    
    it('should reject expired tokens', async () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        { userId: '123', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) - 3600 },
        'test-secret'
      );
      
      // Execute
      const response = await request(app)
        .get('/api/v1/protected')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
      
      // Verify
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toMatch(/expired/i);
    });
    
    it('should reject tampered tokens', async () => {
      // Create a valid token
      const validToken = jwt.sign(
        { userId: '123', email: 'test@example.com' },
        'test-secret',
        { expiresIn: '1h' }
      );
      
      // Tamper with the token (change the payload without updating signature)
      const parts = validToken.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      payload.userId = '456'; // Change user ID
      
      const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
      
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
      
      // Execute
      const response = await request(app)
        .get('/api/v1/protected')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401);
      
      // Verify
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toMatch(/invalid/i);
    });
  });
  
  describe('Brute Force Protection', () => {
    it('should implement rate limiting for failed login attempts', async () => {
      // Setup - user exists but password is wrong
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        passwordHash: await bcrypt.hash('CorrectPassword123!', 12),
        name: 'Test User',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      (UserEntity.findByEmail as any).mockResolvedValue(mockUser);
      
      // Execute multiple failed login attempts
      const maxAttempts = 5;
      
      for (let i = 0; i < maxAttempts; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'test@example.com',
            password: 'WrongPassword123!',
          })
          .expect(401);
      }
      
      // The next attempt should be rate limited
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'WrongPassword123!',
        });
      
      // Verify rate limiting is applied
      expect(response.status).toBe(429);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toMatch(/too many/i);
    });
  });
  
  describe('CSRF Protection', () => {
    it('should implement CSRF protection for sensitive operations', async () => {
      // Setup - create a valid token
      const validToken = jwt.sign(
        { userId: '123', email: 'test@example.com' },
        'test-secret',
        { expiresIn: '1h' }
      );
      
      // Execute without CSRF token
      const response = await request(app)
        .post('/api/v1/auth/refresh-token')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          refreshToken: 'valid-refresh-token',
        });
      
      // Verify CSRF protection
      expect(response.status).toBe(403);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toMatch(/csrf/i);
    });
  });
  
  describe('Input Validation', () => {
    it('should validate and sanitize email inputs', async () => {
      // Test various malformed emails
      const malformedEmails = [
        'not-an-email',
        'missing@domain',
        '@nodomain.com',
        'spaces in@email.com',
        'unicode@\u{1F4E7}.com',
        'sql-injection\'--@example.com',
        'xss<script>alert(1)</script>@example.com',
      ];
      
      for (const email of malformedEmails) {
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send({
            email,
            password: 'ValidPassword123!',
            name: 'Test User',
          });
        
        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
        expect(response.body.error.message).toMatch(/email/i);
      }
    });
    
    it('should prevent SQL injection in auth inputs', async () => {
      // Setup - mock to track what gets passed to the database
      (UserEntity.findByEmail as any).mockImplementation(async (email) => {
        // If SQL injection was successful, this would be executed with the injection
        if (email.includes('--') || email.includes(';') || email.includes('DROP')) {
          throw new Error('SQL injection detected');
        }
        return null;
      });
      
      // Test SQL injection attempts
      const sqlInjectionAttempts = [
        "' OR '1'='1",
        "'; DROP TABLE users; --",
        "admin@example.com'; --",
      ];
      
      for (const injection of sqlInjectionAttempts) {
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: injection,
            password: 'password',
          });
        
        // Should be rejected with validation error, not server error
        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      }
    });
  });
});