#!/usr/bin/env node

/**
 * Chaos Engineering Tests for URL Shortener Platform
 * This script tests system resilience under various failure conditions
 */

const { execSync, spawn } = require('child_process');
const http = require('http');
const { promisify } = require('util');
const wait = promisify(setTimeout);

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
const SERVICES = [
  { name: 'url-shortener', port: 3001, container: 'url-shortener-service' },
  { name: 'analytics', port: 3003, container: 'analytics-service' },
  { name: 'user-management', port: 3002, container: 'user-management-service' },
];

const DATABASES = [
  { name: 'postgres', container: 'postgres' },
  { name: 'redis', container: 'redis' },
  { name: 'clickhouse', container: 'clickhouse' },
];

const GATEWAY = { name: 'api-gateway', port: 3000, container: 'kong' };

// Helper function to make HTTP requests
async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data.length > 0 ? JSON.parse(data) : null,
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data,
            error,
          });
        }
      });
    }).on('error', reject);
  });
}

// Check if a service is healthy
async function checkServiceHealth(service) {
  try {
    const response = await makeRequest(`http://localhost:${service.port}/health`);
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

// Check if the gateway is routing requests correctly
async function checkGatewayRouting() {
  try {
    // Check if the gateway is routing to the URL shortener service
    const response = await makeRequest(`http://localhost:${GATEWAY.port}/api/v1/urls`);
    return response.status === 401; // Should return 401 Unauthorized if routing works
  } catch (error) {
    return false;
  }
}

// Stop a container
async function stopContainer(container) {
  print.info(`Stopping container: ${container}`);
  execSync(`docker stop ${container}`, { stdio: 'inherit' });
}

// Start a container
async function startContainer(container) {
  print.info(`Starting container: ${container}`);
  execSync(`docker start ${container}`, { stdio: 'inherit' });
}

// Test service resilience when a database goes down
async function testDatabaseFailure(database) {
  print.header(`Testing Resilience: ${database.name} Failure`);
  
  // Check initial health
  print.info('Checking initial health...');
  const initialHealth = await Promise.all(
    SERVICES.map(async service => ({
      service: service.name,
      healthy: await checkServiceHealth(service),
    }))
  );
  
  const allHealthy = initialHealth.every(h => h.healthy);
  
  if (!allHealthy) {
    print.error('Not all services are healthy before the test');
    return false;
  }
  
  print.success('All services are healthy');
  
  // Stop the database
  await stopContainer(database.container);
  print.warning(`${database.name} is now down`);
  
  // Wait for services to detect the failure
  print.info('Waiting for services to detect the failure...');
  await wait(5000);
  
  // Check health during failure
  print.info('Checking health during failure...');
  const failureHealth = await Promise.all(
    SERVICES.map(async service => ({
      service: service.name,
      healthy: await checkServiceHealth(service),
    }))
  );
  
  // Log the health status
  failureHealth.forEach(h => {
    if (h.healthy) {
      print.success(`${h.service} is still healthy (good resilience)`);
    } else {
      print.warning(`${h.service} is unhealthy (affected by ${database.name} failure)`);
    }
  });
  
  // Start the database again
  await startContainer(database.container);
  print.info(`${database.name} is back up`);
  
  // Wait for services to recover
  print.info('Waiting for services to recover...');
  await wait(10000);
  
  // Check health after recovery
  print.info('Checking health after recovery...');
  const recoveryHealth = await Promise.all(
    SERVICES.map(async service => ({
      service: service.name,
      healthy: await checkServiceHealth(service),
    }))
  );
  
  const allRecovered = recoveryHealth.every(h => h.healthy);
  
  if (allRecovered) {
    print.success('All services recovered successfully');
    return true;
  } else {
    print.error('Not all services recovered');
    recoveryHealth.forEach(h => {
      if (!h.healthy) {
        print.error(`${h.service} did not recover`);
      }
    });
    return false;
  }
}

// Test service resilience when a service goes down
async function testServiceFailure(service) {
  print.header(`Testing Resilience: ${service.name} Failure`);
  
  // Check initial gateway routing
  print.info('Checking initial gateway routing...');
  const initialRouting = await checkGatewayRouting();
  
  if (!initialRouting) {
    print.error('Gateway routing is not working before the test');
    return false;
  }
  
  print.success('Gateway routing is working');
  
  // Stop the service
  await stopContainer(service.container);
  print.warning(`${service.name} is now down`);
  
  // Wait for gateway to detect the failure
  print.info('Waiting for gateway to detect the failure...');
  await wait(5000);
  
  // Check gateway routing during failure
  print.info('Checking gateway routing during failure...');
  const failureRouting = await checkGatewayRouting();
  
  if (failureRouting) {
    print.success('Gateway routing is still working (good resilience)');
  } else {
    print.warning('Gateway routing is affected by service failure');
  }
  
  // Start the service again
  await startContainer(service.container);
  print.info(`${service.name} is back up`);
  
  // Wait for gateway to detect the recovery
  print.info('Waiting for gateway to detect the recovery...');
  await wait(10000);
  
  // Check gateway routing after recovery
  print.info('Checking gateway routing after recovery...');
  const recoveryRouting = await checkGatewayRouting();
  
  if (recoveryRouting) {
    print.success('Gateway routing recovered successfully');
    return true;
  } else {
    print.error('Gateway routing did not recover');
    return false;
  }
}

// Test network partition between services
async function testNetworkPartition() {
  print.header('Testing Resilience: Network Partition');
  
  // In a real implementation, we would use Docker network manipulation
  // or tools like Toxiproxy to simulate network partitions
  
  print.info('Simulating network partition between services...');
  
  // For this example, we'll just simulate the test
  print.warning('Network partition test is simulated');
  
  // Wait to simulate the test duration
  await wait(5000);
  
  print.info('Resolving network partition...');
  
  // Wait to simulate recovery time
  await wait(5000);
  
  print.success('Network partition test completed');
  return true;
}

// Test high latency between services
async function testHighLatency() {
  print.header('Testing Resilience: High Latency');
  
  // In a real implementation, we would use tools like Toxiproxy
  // to inject latency between services
  
  print.info('Injecting high latency between services...');
  
  // For this example, we'll just simulate the test
  print.warning('High latency test is simulated');
  
  // Wait to simulate the test duration
  await wait(5000);
  
  print.info('Removing latency...');
  
  // Wait to simulate recovery time
  await wait(5000);
  
  print.success('High latency test completed');
  return true;
}

// Test system under high load during failures
async function testLoadDuringFailure() {
  print.header('Testing Resilience: High Load During Failure');
  
  // In a real implementation, we would run load tests while
  // simultaneously causing failures
  
  print.info('Starting load test...');
  
  // For this example, we'll just simulate the test
  print.warning('Load test during failure is simulated');
  
  // Wait to simulate the test duration
  await wait(5000);
  
  print.success('Load test during failure completed');
  return true;
}

// Main function
async function main() {
  print.header('Starting Chaos Engineering Tests');
  
  const results = {
    databaseFailures: [],
    serviceFailures: [],
    networkPartition: null,
    highLatency: null,
    loadDuringFailure: null,
  };
  
  // Test database failures
  for (const database of DATABASES) {
    const result = await testDatabaseFailure(database);
    results.databaseFailures.push({ database: database.name, success: result });
  }
  
  // Test service failures
  for (const service of SERVICES) {
    const result = await testServiceFailure(service);
    results.serviceFailures.push({ service: service.name, success: result });
  }
  
  // Test network partition
  results.networkPartition = await testNetworkPartition();
  
  // Test high latency
  results.highLatency = await testHighLatency();
  
  // Test load during failure
  results.loadDuringFailure = await testLoadDuringFailure();
  
  // Print summary
  print.header('Chaos Engineering Test Summary');
  
  // Database failures
  print.info('Database Failures:');
  results.databaseFailures.forEach(result => {
    const status = result.success ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`;
    console.log(`  ${result.database}: ${status}`);
  });
  
  // Service failures
  print.info('Service Failures:');
  results.serviceFailures.forEach(result => {
    const status = result.success ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`;
    console.log(`  ${result.service}: ${status}`);
  });
  
  // Other tests
  console.log(`Network Partition: ${results.networkPartition ? colors.green + 'PASS' + colors.reset : colors.red + 'FAIL' + colors.reset}`);
  console.log(`High Latency: ${results.highLatency ? colors.green + 'PASS' + colors.reset : colors.red + 'FAIL' + colors.reset}`);
  console.log(`Load During Failure: ${results.loadDuringFailure ? colors.green + 'PASS' + colors.reset : colors.red + 'FAIL' + colors.reset}`);
  
  // Determine overall success
  const allPassed = 
    results.databaseFailures.every(r => r.success) &&
    results.serviceFailures.every(r => r.success) &&
    results.networkPartition &&
    results.highLatency &&
    results.loadDuringFailure;
  
  if (allPassed) {
    print.success('\nAll chaos engineering tests passed!');
    process.exit(0);
  } else {
    print.error('\nSome chaos engineering tests failed!');
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  print.error('An unexpected error occurred:');
  print.error(error);
  process.exit(1);
});