#!/usr/bin/env node

/**
 * Metrics and Alerting System Tests
 * This script tests the metrics collection and alerting system
 */

const http = require('http');
const { execSync } = require('child_process');
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
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';
const ALERTMANAGER_URL = process.env.ALERTMANAGER_URL || 'http://localhost:9093';
const SERVICES = [
  { name: 'url-shortener', port: 3001 },
  { name: 'analytics', port: 3003 },
  { name: 'user-management', port: 3002 },
];

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

// Test if Prometheus is running
async function testPrometheusConnection() {
  print.header('Testing Prometheus Connection');
  
  try {
    const response = await makeRequest(`${PROMETHEUS_URL}/api/v1/status/config`);
    
    if (response.status === 200) {
      print.success('Prometheus is running');
      return true;
    } else {
      print.error(`Prometheus returned status ${response.status}`);
      return false;
    }
  } catch (error) {
    print.error(`Failed to connect to Prometheus: ${error.message}`);
    return false;
  }
}

// Test if AlertManager is running
async function testAlertManagerConnection() {
  print.header('Testing AlertManager Connection');
  
  try {
    const response = await makeRequest(`${ALERTMANAGER_URL}/api/v2/status`);
    
    if (response.status === 200) {
      print.success('AlertManager is running');
      return true;
    } else {
      print.error(`AlertManager returned status ${response.status}`);
      return false;
    }
  } catch (error) {
    print.error(`Failed to connect to AlertManager: ${error.message}`);
    return false;
  }
}

// Test if services are exposing metrics
async function testServiceMetrics() {
  print.header('Testing Service Metrics Endpoints');
  
  const results = [];
  
  for (const service of SERVICES) {
    try {
      const response = await makeRequest(`http://localhost:${service.port}/metrics`);
      
      if (response.status === 200) {
        print.success(`${service.name} is exposing metrics`);
        results.push({ service: service.name, success: true });
      } else {
        print.error(`${service.name} metrics endpoint returned status ${response.status}`);
        results.push({ service: service.name, success: false });
      }
    } catch (error) {
      print.error(`Failed to connect to ${service.name} metrics endpoint: ${error.message}`);
      results.push({ service: service.name, success: false, error: error.message });
    }
  }
  
  return results;
}

// Test if Prometheus is scraping metrics
async function testPrometheusScraping() {
  print.header('Testing Prometheus Scraping');
  
  try {
    // Query for up metric which indicates if targets are being scraped
    const response = await makeRequest(`${PROMETHEUS_URL}/api/v1/query?query=up`);
    
    if (response.status === 200 && response.data && response.data.data && response.data.data.result) {
      const results = response.data.data.result;
      
      if (results.length === 0) {
        print.warning('No targets are being scraped by Prometheus');
        return false;
      }
      
      let allUp = true;
      
      for (const result of results) {
        const instance = result.metric.instance;
        const job = result.metric.job;
        const up = result.value[1] === '1';
        
        if (up) {
          print.success(`Target ${instance} (${job}) is up`);
        } else {
          print.error(`Target ${instance} (${job}) is down`);
          allUp = false;
        }
      }
      
      return allUp;
    } else {
      print.error('Failed to query Prometheus for targets');
      return false;
    }
  } catch (error) {
    print.error(`Failed to test Prometheus scraping: ${error.message}`);
    return false;
  }
}

// Test if custom business metrics are being collected
async function testBusinessMetrics() {
  print.header('Testing Business Metrics');
  
  const businessMetrics = [
    'url_shortener_urls_created_total',
    'url_shortener_redirects_total',
    'url_shortener_active_users_gauge',
  ];
  
  const results = [];
  
  for (const metric of businessMetrics) {
    try {
      const response = await makeRequest(`${PROMETHEUS_URL}/api/v1/query?query=${metric}`);
      
      if (response.status === 200 && response.data && response.data.data) {
        const data = response.data.data;
        
        if (data.result && data.result.length > 0) {
          print.success(`Metric ${metric} is being collected`);
          results.push({ metric, success: true });
        } else {
          print.warning(`Metric ${metric} is not being collected or has no data`);
          results.push({ metric, success: false, reason: 'No data' });
        }
      } else {
        print.error(`Failed to query metric ${metric}`);
        results.push({ metric, success: false, reason: 'Query failed' });
      }
    } catch (error) {
      print.error(`Failed to test metric ${metric}: ${error.message}`);
      results.push({ metric, success: false, error: error.message });
    }
  }
  
  return results;
}

// Test if alerting rules are configured
async function testAlertingRules() {
  print.header('Testing Alerting Rules');
  
  try {
    const response = await makeRequest(`${PROMETHEUS_URL}/api/v1/rules`);
    
    if (response.status === 200 && response.data && response.data.data) {
      const groups = response.data.data.groups;
      
      if (!groups || groups.length === 0) {
        print.warning('No alerting rules are configured');
        return false;
      }
      
      let alertRulesCount = 0;
      
      for (const group of groups) {
        const rules = group.rules.filter(rule => rule.type === 'alerting');
        alertRulesCount += rules.length;
        
        for (const rule of rules) {
          print.info(`Alert rule: ${rule.name}`);
        }
      }
      
      if (alertRulesCount > 0) {
        print.success(`Found ${alertRulesCount} alerting rules`);
        return true;
      } else {
        print.warning('No alerting rules found');
        return false;
      }
    } else {
      print.error('Failed to query Prometheus for alerting rules');
      return false;
    }
  } catch (error) {
    print.error(`Failed to test alerting rules: ${error.message}`);
    return false;
  }
}

// Test if alerts are firing
async function testAlertsFiring() {
  print.header('Testing Alerts Firing');
  
  try {
    const response = await makeRequest(`${PROMETHEUS_URL}/api/v1/alerts`);
    
    if (response.status === 200 && response.data && response.data.data) {
      const alerts = response.data.data.alerts;
      
      if (!alerts || alerts.length === 0) {
        print.info('No alerts are currently firing (this is good in a healthy system)');
        return true;
      }
      
      for (const alert of alerts) {
        const name = alert.labels.alertname;
        const state = alert.state;
        
        if (state === 'firing') {
          print.warning(`Alert ${name} is firing`);
        } else {
          print.info(`Alert ${name} is ${state}`);
        }
      }
      
      return true;
    } else {
      print.error('Failed to query Prometheus for alerts');
      return false;
    }
  } catch (error) {
    print.error(`Failed to test alerts: ${error.message}`);
    return false;
  }
}

// Test if health check endpoints are working
async function testHealthChecks() {
  print.header('Testing Health Check Endpoints');
  
  const results = [];
  
  for (const service of SERVICES) {
    try {
      const response = await makeRequest(`http://localhost:${service.port}/health`);
      
      if (response.status === 200) {
        print.success(`${service.name} health check is OK`);
        results.push({ service: service.name, success: true });
      } else {
        print.error(`${service.name} health check returned status ${response.status}`);
        results.push({ service: service.name, success: false });
      }
    } catch (error) {
      print.error(`Failed to connect to ${service.name} health check: ${error.message}`);
      results.push({ service: service.name, success: false, error: error.message });
    }
  }
  
  return results;
}

// Main function
async function main() {
  print.header('Starting Metrics and Alerting System Tests');
  
  const results = {
    prometheusConnection: await testPrometheusConnection(),
    alertManagerConnection: await testAlertManagerConnection(),
    serviceMetrics: await testServiceMetrics(),
    prometheusScraping: await testPrometheusScraping(),
    businessMetrics: await testBusinessMetrics(),
    alertingRules: await testAlertingRules(),
    alertsFiring: await testAlertsFiring(),
    healthChecks: await testHealthChecks(),
  };
  
  // Print summary
  print.header('Test Summary');
  
  for (const [test, result] of Object.entries(results)) {
    if (typeof result === 'boolean') {
      const status = result ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`;
      console.log(`${test}: ${status}`);
    } else if (Array.isArray(result)) {
      const successCount = result.filter(r => r.success).length;
      const totalCount = result.length;
      const status = successCount === totalCount ? 
        `${colors.green}${successCount}/${totalCount} PASS${colors.reset}` : 
        `${colors.yellow}${successCount}/${totalCount} PARTIAL${colors.reset}`;
      
      console.log(`${test}: ${status}`);
    }
  }
  
  // Determine overall success
  const criticalTests = [
    'prometheusConnection',
    'serviceMetrics',
    'prometheusScraping',
    'healthChecks',
  ];
  
  const criticalFailures = criticalTests.filter(test => {
    const result = results[test];
    if (typeof result === 'boolean') {
      return !result;
    } else if (Array.isArray(result)) {
      return result.some(r => !r.success);
    }
    return false;
  });
  
  if (criticalFailures.length === 0) {
    print.success('\nAll critical tests passed!');
    process.exit(0);
  } else {
    print.error('\nSome critical tests failed:');
    criticalFailures.forEach(test => print.error(`- ${test}`));
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  print.error('An unexpected error occurred:');
  print.error(error);
  process.exit(1);
});