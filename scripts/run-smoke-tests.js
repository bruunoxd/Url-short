#!/usr/bin/env node

/**
 * URL Shortener Platform Smoke Tests
 * 
 * This script runs basic smoke tests against the deployed services to verify
 * that the core functionality is working correctly after deployment.
 */

const axios = require('axios');
const assert = require('assert');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://url-shortener';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://frontend';
const USER_MANAGEMENT_URL = process.env.USER_MANAGEMENT_URL || 'http://user-management';
const ANALYTICS_URL = process.env.ANALYTICS_URL || 'http://analytics';

// Test credentials
const TEST_USER = {
  email: 'smoke-test@example.com',
  password: 'SmokeTest123!',
  name: 'Smoke Test User'
};

// Test URL
const TEST_URL = {
  originalUrl: 'https://example.com/smoke-test',
  title: 'Smoke Test URL'
};

// Global variables
let authToken;
let shortUrlId;
let shortCode;

// Helper functions
const log = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

const logSuccess = (message) => {
  console.log(`[${new Date().toISOString()}] ✅ ${message}`);
};

const logError = (message, error) => {
  console.error(`[${new Date().toISOString()}] ❌ ${message}`);
  if (error) {
    console.error(error.response?.data || error.message || error);
  }
  process.exit(1);
};

// Test functions
async function testHealthEndpoints() {
  log('Testing health endpoints...');
  
  try {
    // Test URL shortener health
    const urlShortenerHealth = await axios.get(`${API_BASE_URL}/health`);
    assert.strictEqual(urlShortenerHealth.status, 200);
    assert.strictEqual(urlShortenerHealth.data.status, 'healthy');
    
    // Test user management health
    const userManagementHealth = await axios.get(`${USER_MANAGEMENT_URL}/health`);
    assert.strictEqual(userManagementHealth.status, 200);
    assert.strictEqual(userManagementHealth.data.status, 'healthy');
    
    // Test analytics health
    const analyticsHealth = await axios.get(`${ANALYTICS_URL}/health`);
    assert.strictEqual(analyticsHealth.status, 200);
    assert.strictEqual(analyticsHealth.data.status, 'healthy');
    
    // Test frontend health
    const frontendHealth = await axios.get(`${FRONTEND_URL}/api/health`);
    assert.strictEqual(frontendHealth.status, 200);
    
    logSuccess('All health endpoints are responding correctly');
  } catch (error) {
    logError('Health endpoint test failed', error);
  }
}

async function testUserRegistration() {
  log('Testing user registration...');
  
  try {
    // Register a new user
    const registerResponse = await axios.post(`${USER_MANAGEMENT_URL}/api/v1/auth/register`, TEST_USER);
    assert.strictEqual(registerResponse.status, 201);
    assert.ok(registerResponse.data.user);
    assert.strictEqual(registerResponse.data.user.email, TEST_USER.email);
    
    logSuccess('User registration successful');
  } catch (error) {
    // If user already exists, that's fine for smoke tests
    if (error.response?.status === 409) {
      log('User already exists, proceeding with login');
    } else {
      logError('User registration test failed', error);
    }
  }
}

async function testUserLogin() {
  log('Testing user login...');
  
  try {
    // Login with the test user
    const loginResponse = await axios.post(`${USER_MANAGEMENT_URL}/api/v1/auth/login`, {
      email: TEST_USER.email,
      password: TEST_USER.password
    });
    
    assert.strictEqual(loginResponse.status, 200);
    assert.ok(loginResponse.data.token);
    
    // Save the auth token for subsequent requests
    authToken = loginResponse.data.token;
    
    logSuccess('User login successful');
  } catch (error) {
    logError('User login test failed', error);
  }
}

async function testUrlShortening() {
  log('Testing URL shortening...');
  
  try {
    // Create a short URL
    const createResponse = await axios.post(
      `${API_BASE_URL}/api/v1/urls`,
      TEST_URL,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    assert.strictEqual(createResponse.status, 201);
    assert.ok(createResponse.data.id);
    assert.ok(createResponse.data.shortCode);
    assert.strictEqual(createResponse.data.originalUrl, TEST_URL.originalUrl);
    
    // Save the URL ID and short code for subsequent tests
    shortUrlId = createResponse.data.id;
    shortCode = createResponse.data.shortCode;
    
    logSuccess('URL shortening successful');
  } catch (error) {
    logError('URL shortening test failed', error);
  }
}

async function testUrlRedirect() {
  log('Testing URL redirect...');
  
  try {
    // Test the redirect
    const redirectResponse = await axios.get(
      `${API_BASE_URL}/${shortCode}`,
      {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400
      }
    );
    
    assert.strictEqual(redirectResponse.status, 302);
    assert.strictEqual(redirectResponse.headers.location, TEST_URL.originalUrl);
    
    logSuccess('URL redirect successful');
  } catch (error) {
    logError('URL redirect test failed', error);
  }
}

async function testAnalytics() {
  log('Testing analytics...');
  
  try {
    // Wait a moment for analytics to be processed
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get analytics for the short URL
    const analyticsResponse = await axios.get(
      `${ANALYTICS_URL}/api/v1/analytics/${shortUrlId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    assert.strictEqual(analyticsResponse.status, 200);
    assert.ok(analyticsResponse.data);
    
    logSuccess('Analytics retrieval successful');
  } catch (error) {
    logError('Analytics test failed', error);
  }
}

async function testUrlUpdate() {
  log('Testing URL update...');
  
  try {
    // Update the short URL
    const updateResponse = await axios.put(
      `${API_BASE_URL}/api/v1/urls/${shortUrlId}`,
      {
        title: 'Updated Smoke Test URL',
        tags: ['smoke-test', 'updated']
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    assert.strictEqual(updateResponse.status, 200);
    assert.strictEqual(updateResponse.data.title, 'Updated Smoke Test URL');
    
    logSuccess('URL update successful');
  } catch (error) {
    logError('URL update test failed', error);
  }
}

async function testCleanup() {
  log('Cleaning up test data...');
  
  try {
    // Delete the short URL
    const deleteResponse = await axios.delete(
      `${API_BASE_URL}/api/v1/urls/${shortUrlId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    assert.strictEqual(deleteResponse.status, 204);
    
    logSuccess('Test data cleanup successful');
  } catch (error) {
    logError('Test data cleanup failed', error);
  }
}

// Main test runner
async function runTests() {
  log('Starting smoke tests...');
  
  try {
    await testHealthEndpoints();
    await testUserRegistration();
    await testUserLogin();
    await testUrlShortening();
    await testUrlRedirect();
    await testAnalytics();
    await testUrlUpdate();
    await testCleanup();
    
    log('All smoke tests passed successfully! 🎉');
    process.exit(0);
  } catch (error) {
    logError('Smoke tests failed', error);
  }
}

// Run the tests
runTests().catch(error => {
  logError('Unhandled error in smoke tests', error);
});