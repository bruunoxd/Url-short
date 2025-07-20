#!/usr/bin/env node

/**
 * API Documentation Generator
 * This script generates OpenAPI documentation from code annotations and schemas
 */

const fs = require('fs');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const yaml = require('js-yaml');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Helper to print colored messages
const print = {
  info: (msg) => console.log(`${colors.blue}${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.bright}${colors.cyan}=== ${msg} ===${colors.reset}\n`)
};

// Configuration
const OUTPUT_DIR = path.join(process.cwd(), 'docs', 'api');
const OPENAPI_JSON_PATH = path.join(OUTPUT_DIR, 'openapi.json');
const OPENAPI_YAML_PATH = path.join(OUTPUT_DIR, 'openapi.yaml');

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

// Create output directory if it doesn't exist
function createOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    print.info(`Created output directory: ${OUTPUT_DIR}`);
  }
}

// Generate OpenAPI specification
function generateOpenApiSpec() {
  print.header('Generating OpenAPI Specification');
  
  try {
    const openapiSpec = swaggerJsdoc(options);
    
    // Write JSON spec
    fs.writeFileSync(OPENAPI_JSON_PATH, JSON.stringify(openapiSpec, null, 2));
    print.success(`OpenAPI JSON written to: ${OPENAPI_JSON_PATH}`);
    
    // Write YAML spec
    fs.writeFileSync(OPENAPI_YAML_PATH, yaml.dump(openapiSpec));
    print.success(`OpenAPI YAML written to: ${OPENAPI_YAML_PATH}`);
    
    return openapiSpec;
  } catch (error) {
    print.error('Failed to generate OpenAPI specification:');
    print.error(error.message);
    throw error;
  }
}

// Validate OpenAPI specification
function validateOpenApiSpec(spec) {
  print.header('Validating OpenAPI Specification');
  
  // Check for required sections
  const requiredSections = ['paths', 'components', 'tags', 'info'];
  const missingSections = requiredSections.filter(section => !spec[section]);
  
  if (missingSections.length > 0) {
    print.warning(`Missing required sections: ${missingSections.join(', ')}`);
  } else {
    print.success('All required sections are present');
  }
  
  // Check for paths
  const pathCount = Object.keys(spec.paths || {}).length;
  print.info(`Found ${pathCount} API paths`);
  
  if (pathCount === 0) {
    print.warning('No API paths found. Check your JSDoc annotations.');
  }
  
  // Check for schemas
  const schemaCount = Object.keys(spec.components?.schemas || {}).length;
  print.info(`Found ${schemaCount} schemas`);
  
  if (schemaCount === 0) {
    print.warning('No schemas found. Check your JSDoc annotations.');
  }
  
  return pathCount > 0 && schemaCount > 0;
}

// Generate HTML documentation
function generateHtmlDocs(spec) {
  print.header('Generating HTML Documentation');
  
  try {
    const redocPath = path.join(OUTPUT_DIR, 'index.html');
    
    const html = `
<!DOCTYPE html>
<html>
  <head>
    <title>URL Shortener Platform API Documentation</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
    <style>
      body {
        margin: 0;
        padding: 0;
      }
    </style>
  </head>
  <body>
    <div id="redoc-container"></div>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
    <script>
      Redoc.init(
        './openapi.json',
        {
          scrollYOffset: 50,
          hideDownloadButton: false,
          expandResponses: '200,201',
          pathInMiddlePanel: true,
          theme: {
            colors: {
              primary: {
                main: '#1976d2'
              }
            }
          }
        },
        document.getElementById('redoc-container')
      )
    </script>
  </body>
</html>
    `;
    
    fs.writeFileSync(redocPath, html);
    print.success(`HTML documentation written to: ${redocPath}`);
    
    return true;
  } catch (error) {
    print.error('Failed to generate HTML documentation:');
    print.error(error.message);
    return false;
  }
}

// Main function
function main() {
  try {
    createOutputDir();
    const spec = generateOpenApiSpec();
    const isValid = validateOpenApiSpec(spec);
    
    if (isValid) {
      generateHtmlDocs(spec);
      print.success('\nAPI documentation generated successfully!');
    } else {
      print.warning('\nAPI documentation generated with warnings.');
    }
  } catch (error) {
    print.error('\nFailed to generate API documentation:');
    print.error(error);
    process.exit(1);
  }
}

// Run the script
main();