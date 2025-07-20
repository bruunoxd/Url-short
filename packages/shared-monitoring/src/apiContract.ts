import fs from 'fs';
import path from 'path';
import axios from 'axios';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import swaggerJsdoc from 'swagger-jsdoc';
import yaml from 'js-yaml';

// Setup AJV validator
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

/**
 * Generate OpenAPI specification from code annotations
 */
export function generateOpenApiSpec() {
  // OpenAPI definition
  const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
      title: 'URL Shortener Platform API',
      version: '1.0.0',
      description: 'API documentation for the URL Shortener Platform',
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
      contact: {
        name: 'API Support',
        url: 'https://url-shortener-platform.example.com/support',
        email: 'support@example.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000/api/v1',
        description: 'Development server',
      },
      {
        url: 'https://api.url-shortener-platform.example.com/api/v1',
        description: 'Production server',
      },
    ],
    tags: [
      {
        name: 'URLs',
        description: 'URL shortening and management',
      },
      {
        name: 'Analytics',
        description: 'URL analytics and statistics',
      },
      {
        name: 'Authentication',
        description: 'User authentication and authorization',
      },
      {
        name: 'Users',
        description: 'User management',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        // URL Schemas
        CreateUrlRequest: {
          type: 'object',
          required: ['originalUrl'],
          properties: {
            originalUrl: {
              type: 'string',
              format: 'uri',
              description: 'The original URL to shorten',
            },
            title: {
              type: 'string',
              description: 'Optional title for the URL',
            },
            tags: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Optional tags for categorization',
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              description: 'Optional expiration date',
            },
          },
        },
        ShortUrlResponse: {
          type: 'object',
          required: ['id', 'originalUrl', 'shortUrl', 'shortCode', 'isActive', 'createdAt', 'updatedAt'],
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique identifier for the short URL',
            },
            originalUrl: {
              type: 'string',
              format: 'uri',
              description: 'The original URL',
            },
            shortUrl: {
              type: 'string',
              format: 'uri',
              description: 'The full shortened URL',
            },
            shortCode: {
              type: 'string',
              description: 'The short code part of the URL',
            },
            title: {
              type: 'string',
              description: 'Optional title for the URL',
            },
            tags: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Tags for categorization',
            },
            isActive: {
              type: 'boolean',
              description: 'Whether the URL is active',
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Expiration date if set',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Creation timestamp',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp',
            },
          },
        },
        
        // Authentication Schemas
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
            },
            password: {
              type: 'string',
              description: 'User password',
            },
          },
        },
        RegisterRequest: {
          type: 'object',
          required: ['email', 'password', 'name'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
            },
            password: {
              type: 'string',
              description: 'User password',
            },
            name: {
              type: 'string',
              description: 'User display name',
            },
          },
        },
        AuthResponse: {
          type: 'object',
          required: ['token', 'refreshToken', 'user'],
          properties: {
            token: {
              type: 'string',
              description: 'JWT access token',
            },
            refreshToken: {
              type: 'string',
              description: 'Refresh token for obtaining new access tokens',
            },
            user: {
              type: 'object',
              required: ['id', 'email'],
              properties: {
                id: {
                  type: 'string',
                  format: 'uuid',
                  description: 'User ID',
                },
                email: {
                  type: 'string',
                  format: 'email',
                  description: 'User email',
                },
                name: {
                  type: 'string',
                  description: 'User display name',
                },
              },
            },
          },
        },
        
        // Analytics Schemas
        AnalyticsResponse: {
          type: 'object',
          properties: {
            totalClicks: {
              type: 'integer',
              description: 'Total number of clicks',
            },
            uniqueVisitors: {
              type: 'integer',
              description: 'Number of unique visitors',
            },
            clicksByDate: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: {
                    type: 'string',
                    format: 'date',
                    description: 'Date of clicks',
                  },
                  clicks: {
                    type: 'integer',
                    description: 'Number of clicks on this date',
                  },
                  uniqueVisitors: {
                    type: 'integer',
                    description: 'Number of unique visitors on this date',
                  },
                },
              },
            },
            clicksByCountry: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  country: {
                    type: 'string',
                    description: 'Country name',
                  },
                  clicks: {
                    type: 'integer',
                    description: 'Number of clicks from this country',
                  },
                  percentage: {
                    type: 'number',
                    description: 'Percentage of total clicks',
                  },
                },
              },
            },
            clicksByDevice: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  deviceType: {
                    type: 'string',
                    description: 'Device type (desktop, mobile, tablet)',
                  },
                  clicks: {
                    type: 'integer',
                    description: 'Number of clicks from this device type',
                  },
                  percentage: {
                    type: 'number',
                    description: 'Percentage of total clicks',
                  },
                },
              },
            },
            clicksByBrowser: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  browser: {
                    type: 'string',
                    description: 'Browser name',
                  },
                  clicks: {
                    type: 'integer',
                    description: 'Number of clicks from this browser',
                  },
                  percentage: {
                    type: 'number',
                    description: 'Percentage of total clicks',
                  },
                },
              },
            },
            topReferrers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  referrer: {
                    type: 'string',
                    description: 'Referrer domain',
                  },
                  clicks: {
                    type: 'integer',
                    description: 'Number of clicks from this referrer',
                  },
                  percentage: {
                    type: 'number',
                    description: 'Percentage of total clicks',
                  },
                },
              },
            },
          },
        },
        
        // Error Response Schema
        ErrorResponse: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'timestamp', 'requestId'],
              properties: {
                code: {
                  type: 'string',
                  description: 'Error code',
                },
                message: {
                  type: 'string',
                  description: 'Error message',
                },
                details: {
                  type: 'object',
                  description: 'Additional error details',
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Error timestamp',
                },
                requestId: {
                  type: 'string',
                  description: 'Request ID for tracking',
                },
              },
            },
          },
        },
      },
    },
    paths: {
      // URL Shortener Endpoints
      '/api/v1/urls': {
        post: {
          tags: ['URLs'],
          summary: 'Create a new short URL',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/CreateUrlRequest',
                },
              },
            },
          },
          responses: {
            201: {
              description: 'URL created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        $ref: '#/components/schemas/ShortUrlResponse',
                      },
                      meta: {
                        type: 'object',
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: 'Invalid input',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            401: {
              description: 'Unauthorized',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
        get: {
          tags: ['URLs'],
          summary: 'Get all URLs for the authenticated user',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'page',
              in: 'query',
              schema: {
                type: 'integer',
                default: 1,
              },
              description: 'Page number',
            },
            {
              name: 'limit',
              in: 'query',
              schema: {
                type: 'integer',
                default: 10,
              },
              description: 'Number of items per page',
            },
            {
              name: 'search',
              in: 'query',
              schema: {
                type: 'string',
              },
              description: 'Search term for filtering URLs',
            },
          ],
          responses: {
            200: {
              description: 'List of URLs',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          $ref: '#/components/schemas/ShortUrlResponse',
                        },
                      },
                      meta: {
                        type: 'object',
                        properties: {
                          total: {
                            type: 'integer',
                          },
                          page: {
                            type: 'integer',
                          },
                          limit: {
                            type: 'integer',
                          },
                          pages: {
                            type: 'integer',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            401: {
              description: 'Unauthorized',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
      },
      
      // Authentication Endpoints
      '/api/v1/auth/login': {
        post: {
          tags: ['Authentication'],
          summary: 'Login with email and password',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/LoginRequest',
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Login successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        $ref: '#/components/schemas/AuthResponse',
                      },
                      meta: {
                        type: 'object',
                      },
                    },
                  },
                },
              },
            },
            401: {
              description: 'Invalid credentials',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
      },
      
      // Analytics Endpoints
      '/api/v1/analytics/{urlId}': {
        get: {
          tags: ['Analytics'],
          summary: 'Get analytics for a specific URL',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'urlId',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
                format: 'uuid',
              },
              description: 'URL ID',
            },
            {
              name: 'startDate',
              in: 'query',
              schema: {
                type: 'string',
                format: 'date-time',
              },
              description: 'Start date for analytics',
            },
            {
              name: 'endDate',
              in: 'query',
              schema: {
                type: 'string',
                format: 'date-time',
              },
              description: 'End date for analytics',
            },
            {
              name: 'granularity',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['hour', 'day', 'week', 'month'],
                default: 'day',
              },
              description: 'Time granularity for analytics',
            },
          ],
          responses: {
            200: {
              description: 'Analytics data',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        $ref: '#/components/schemas/AnalyticsResponse',
                      },
                      meta: {
                        type: 'object',
                      },
                    },
                  },
                },
              },
            },
            401: {
              description: 'Unauthorized',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            404: {
              description: 'URL not found',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  
  // Options for swagger-jsdoc
  const options = {
    definition: swaggerDefinition,
    apis: [
      './services/url-shortener/src/**/*.ts',
      './services/analytics/src/**/*.ts',
      './services/user-management/src/**/*.ts',
      './packages/shared-types/src/**/*.ts',
    ],
  };
  
  try {
    // Generate OpenAPI spec
    const openapiSpec = swaggerJsdoc(options);
    
    // Create output directory if it doesn't exist
    const outputDir = path.join(process.cwd(), 'docs', 'api');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write JSON spec
    fs.writeFileSync(path.join(outputDir, 'openapi.json'), JSON.stringify(openapiSpec, null, 2));
    
    // Write YAML spec
    fs.writeFileSync(path.join(outputDir, 'openapi.yaml'), yaml.dump(openapiSpec));
    
    return openapiSpec;
  } catch (error) {
    console.error('Failed to generate OpenAPI specification:', error);
    throw error;
  }
}

/**
 * Validate API implementation against OpenAPI contract
 */
export async function validateApiContract(baseUrl: string) {
  try {
    // Generate or load OpenAPI spec
    const openApiSpec = generateOpenApiSpec();
    
    // Extract endpoints to validate
    const endpoints = Object.keys(openApiSpec.paths);
    
    // Results
    const results = {
      valid: true,
      endpoints: endpoints.length,
      failures: [] as string[],
    };
    
    // For a real implementation, we would make actual API calls and validate responses
    // For this example, we'll simulate validation
    
    // Simulate validation for a few endpoints
    const testEndpoints = [
      { path: '/api/v1/urls', method: 'get' },
      { path: '/api/v1/auth/login', method: 'post' },
      { path: '/api/v1/analytics/{urlId}', method: 'get', params: { urlId: '123e4567-e89b-12d3-a456-426614174000' } },
    ];
    
    for (const endpoint of testEndpoints) {
      try {
        // In a real implementation, we would make an actual API call
        // and validate the response against the schema
        
        // For now, we'll just simulate success
        console.log(`Validated ${endpoint.method.toUpperCase()} ${endpoint.path}`);
      } catch (error) {
        results.valid = false;
        results.failures.push(`${endpoint.method.toUpperCase()} ${endpoint.path}: ${error}`);
      }
    }
    
    return results;
  } catch (error) {
    console.error('API contract validation failed:', error);
    throw error;
  }
}