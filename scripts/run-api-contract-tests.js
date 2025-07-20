#!/usr/bin/env node

/**
 * API Contract Testing Script
 * This script validates that API implementations conform to their OpenAPI specifications
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

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
const API_ENDPOINTS = [
  { name: 'URL Shortener API', url: 'http://localhost:3001/api/v1' },
  { name: 'User Management API', url: 'http://localhost:3002/api/v1' },
  { name: 'Analytics API', url: 'http://localhost:3003/api/v1' }
];

// Check if services are running
function checkServiceAvailability(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      resolve(res.statusCode < 500);
    }).on('error', () => {
      resolve(false);
    });
  });
}

// Generate OpenAPI spec
function generateOpenApiSpec() {
  print.header('Generating OpenAPI Specification');
  
  try {
    execSync('node scripts/generate-api-docs.js', { stdio: 'inherit' });
    print.success('OpenAPI specification generated successfully');
    return true;
  } catch (error) {
    print.error('Failed to generate OpenAPI specification');
    print.error(error.message);
    return false;
  }
}

// Run contract tests
function runContractTests() {
  print.header('Running API Contract Tests');
  
  try {
    execSync('npx vitest run packages/shared-monitoring/src/tests/apiContract.test.ts', { 
      stdio: 'inherit'
    });
    print.success('API contract tests passed');
    return true;
  } catch (error) {
    print.error('API contract tests failed');
    print.error(error.message);
    return false;
  }
}

// Run API versioning tests
function runVersioningTests() {
  print.header('Running API Versioning Tests');
  
  try {
    execSync('npx vitest run packages/shared-monitoring/src/tests/apiVersioning.test.ts', { 
      stdio: 'inherit'
    });
    print.success('API versioning tests passed');
    return true;
  } catch (error) {
    print.error('API versioning tests failed');
    print.error(error.message);
    return false;
  }
}

// Main function
async function main() {
  print.header('Starting API Contract Testing');
  
  // Check if services are running
  print.info('Checking if API services are running...');
  
  const availabilityChecks = await Promise.all(
    API_ENDPOINTS.map(async (endpoint) => {
      const isAvailable = await checkServiceAvailability(endpoint.url);
      return { ...endpoint, isAvailable };
    })
  );
  
  const unavailableServices = availabilityChecks.filter(check => !check.isAvailable);
  
  if (unavailableServices.length > 0) {
    print.warning('Some API services are not available:');
    unavailableServices.forEach(service => {
      print.warning(`- ${service.name} (${service.url})`);
    });
    
    if (process.env.CI) {
      print.error('Running in CI environment, failing the build');
      process.exit(1);
    }
    
    print.warning('Continuing with available services only...');
  }
  
  // Generate OpenAPI spec
  if (!generateOpenApiSpec()) {
    process.exit(1);
  }
  
  // Run contract tests
  if (!runContractTests()) {
    process.exit(1);
  }
  
  // Run versioning tests
  if (!runVersioningTests()) {
    process.exit(1);
  }
  
  print.success('\nAll API contract tests passed!');
}

main().catch(error => {
  print.error('An unexpected error occurred:');
  print.error(error);
  process.exit(1);
});