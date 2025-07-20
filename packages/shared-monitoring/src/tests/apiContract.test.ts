import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validateApiContract, generateOpenApiSpec } from '../apiContract';
import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Setup AJV validator
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

describe('API Contract Tests', () => {
  let openApiSpec: any;
  
  beforeAll(() => {
    // Generate or load OpenAPI spec
    openApiSpec = generateOpenApiSpec();
  });
  
  describe('OpenAPI Specification', () => {
    it('should have valid OpenAPI structure', () => {
      expect(openApiSpec).toBeDefined();
      expect(openApiSpec.openapi).toBe('3.0.0');
      expect(openApiSpec.info).toBeDefined();
      expect(openApiSpec.paths).toBeDefined();
      expect(openApiSpec.components).toBeDefined();
      expect(openApiSpec.components.schemas).toBeDefined();
    });
    
    it('should include all required API endpoints', () => {
      const requiredEndpoints = [
        '/api/v1/urls',
        '/api/v1/urls/{id}',
        '/api/v1/auth/login',
        '/api/v1/auth/register',
        '/api/v1/analytics/{urlId}',
      ];
      
      for (const endpoint of requiredEndpoints) {
        expect(openApiSpec.paths[endpoint]).toBeDefined();
      }
    });
    
    it('should define security schemes', () => {
      expect(openApiSpec.components.securitySchemes).toBeDefined();
      expect(openApiSpec.components.securitySchemes.bearerAuth).toBeDefined();
    });
  });
  
  describe('URL Shortener API', () => {
    it('should validate URL creation schema', () => {
      const schema = openApiSpec.components.schemas.CreateUrlRequest;
      expect(schema).toBeDefined();
      
      const validate = ajv.compile(schema);
      
      // Valid request
      expect(validate({
        originalUrl: 'https://example.com',
        title: 'Example URL',
        tags: ['example', 'test'],
      })).toBe(true);
      
      // Invalid URL
      expect(validate({
        originalUrl: 'not-a-url',
        title: 'Example URL',
      })).toBe(false);
      
      // Missing required field
      expect(validate({
        title: 'Example URL',
      })).toBe(false);
    });
    
    it('should validate URL response schema', () => {
      const schema = openApiSpec.components.schemas.ShortUrlResponse;
      expect(schema).toBeDefined();
      
      const validate = ajv.compile(schema);
      
      // Valid response
      expect(validate({
        id: '123e4567-e89b-12d3-a456-426614174000',
        originalUrl: 'https://example.com',
        shortUrl: 'https://short.ly/abc123',
        shortCode: 'abc123',
        title: 'Example URL',
        tags: ['example', 'test'],
        isActive: true,
        createdAt: '2025-07-16T12:00:00Z',
        updatedAt: '2025-07-16T12:00:00Z',
      })).toBe(true);
      
      // Missing required fields
      expect(validate({
        originalUrl: 'https://example.com',
        shortUrl: 'https://short.ly/abc123',
      })).toBe(false);
    });
  });
  
  describe('Authentication API', () => {
    it('should validate login request schema', () => {
      const schema = openApiSpec.components.schemas.LoginRequest;
      expect(schema).toBeDefined();
      
      const validate = ajv.compile(schema);
      
      // Valid request
      expect(validate({
        email: 'user@example.com',
        password: 'password123',
      })).toBe(true);
      
      // Invalid email
      expect(validate({
        email: 'not-an-email',
        password: 'password123',
      })).toBe(false);
      
      // Missing required field
      expect(validate({
        email: 'user@example.com',
      })).toBe(false);
    });
    
    it('should validate authentication response schema', () => {
      const schema = openApiSpec.components.schemas.AuthResponse;
      expect(schema).toBeDefined();
      
      const validate = ajv.compile(schema);
      
      // Valid response
      expect(validate({
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'refresh-token',
        user: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          email: 'user@example.com',
          name: 'Test User',
        },
      })).toBe(true);
      
      // Missing required fields
      expect(validate({
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      })).toBe(false);
    });
  });
  
  describe('Analytics API', () => {
    it('should validate analytics response schema', () => {
      const schema = openApiSpec.components.schemas.AnalyticsResponse;
      expect(schema).toBeDefined();
      
      const validate = ajv.compile(schema);
      
      // Valid response
      expect(validate({
        totalClicks: 100,
        uniqueVisitors: 50,
        clicksByDate: [
          { date: '2025-07-01', clicks: 10, uniqueVisitors: 5 },
          { date: '2025-07-02', clicks: 20, uniqueVisitors: 10 },
        ],
        clicksByCountry: [
          { country: 'Brazil', clicks: 50, percentage: 50 },
          { country: 'United States', clicks: 30, percentage: 30 },
        ],
        clicksByDevice: [
          { deviceType: 'desktop', clicks: 60, percentage: 60 },
          { deviceType: 'mobile', clicks: 40, percentage: 40 },
        ],
        clicksByBrowser: [
          { browser: 'Chrome', clicks: 70, percentage: 70 },
          { browser: 'Firefox', clicks: 30, percentage: 30 },
        ],
        topReferrers: [
          { referrer: 'google.com', clicks: 40, percentage: 40 },
          { referrer: 'facebook.com', clicks: 30, percentage: 30 },
        ],
      })).toBe(true);
    });
  });
  
  describe('Error Response', () => {
    it('should validate error response schema', () => {
      const schema = openApiSpec.components.schemas.ErrorResponse;
      expect(schema).toBeDefined();
      
      const validate = ajv.compile(schema);
      
      // Valid error response
      expect(validate({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: { field: 'email', message: 'Invalid email format' },
          timestamp: '2025-07-16T12:00:00Z',
          requestId: 'req-123',
        },
      })).toBe(true);
      
      // Missing required fields
      expect(validate({
        error: {
          message: 'Invalid input data',
        },
      })).toBe(false);
    });
  });
  
  describe('API Versioning', () => {
    it('should include version in all API paths', () => {
      const paths = Object.keys(openApiSpec.paths);
      
      for (const path of paths) {
        if (path.startsWith('/api/')) {
          expect(path).toMatch(/\/api\/v\d+\//);
        }
      }
    });
  });
  
  describe('API Implementation Validation', () => {
    it('should validate API implementation against contract', async () => {
      // This test would typically make actual API calls to validate responses
      // For this example, we'll mock the validation function
      
      const validationResult = await validateApiContract('http://localhost:3000');
      
      expect(validationResult.valid).toBe(true);
      expect(validationResult.endpoints).toBeGreaterThan(0);
      expect(validationResult.failures).toEqual([]);
    });
  });
});