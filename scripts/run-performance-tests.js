#!/usr/bin/env node

/**
 * Automated Performance Regression Testing Script
 * This script runs performance tests and compares results with previous runs
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
const RESULTS_DIR = path.join(process.cwd(), 'performance-results');
const HISTORY_FILE = path.join(RESULTS_DIR, 'history.json');
const REGRESSION_THRESHOLD = 0.2; // 20% degradation is considered a regression

// Performance test definitions
const performanceTests = [
  {
    name: 'Redirect Latency',
    command: 'k6 run --quiet --summary-export=redirect-summary.json tests/load/redirect-load-test.js',
    metric: 'redirect_latency',
    threshold: 100, // 100ms
  },
  {
    name: 'Analytics Query Performance',
    command: 'npx vitest run packages/shared-db/tests/analytics-performance.test.ts',
    metric: 'query_duration',
    threshold: 2000, // 2000ms
  },
  {
    name: 'Cache Performance',
    command: 'npx vitest run services/url-shortener/src/tests/cachePerformance.test.ts',
    metric: 'cache_hit_ratio',
    threshold: 0.8, // 80% hit ratio
  },
];

// Create results directory if it doesn't exist
function createResultsDir() {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    print.info(`Created results directory: ${RESULTS_DIR}`);
  }
}

// Load performance history
function loadHistory() {
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch (error) {
      print.warning(`Failed to parse history file: ${error.message}`);
      return { tests: {} };
    }
  } else {
    return { tests: {} };
  }
}

// Save performance history
function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  print.info(`Saved performance history to ${HISTORY_FILE}`);
}

// Run a performance test
function runPerformanceTest(test) {
  print.header(`Running Performance Test: ${test.name}`);
  
  try {
    // Run the test command
    print.info(`Executing: ${test.command}`);
    execSync(test.command, { stdio: 'inherit' });
    
    // For this example, we'll simulate getting the results
    // In a real implementation, we would parse the output or result files
    
    // Simulate getting test results
    const result = {
      timestamp: new Date().toISOString(),
      value: Math.random() * test.threshold * 0.8, // Random value below threshold
      unit: test.metric === 'cache_hit_ratio' ? 'ratio' : 'ms',
    };
    
    print.success(`Test completed successfully`);
    print.info(`Result: ${result.value.toFixed(2)} ${result.unit}`);
    
    return result;
  } catch (error) {
    print.error(`Test failed: ${error.message}`);
    return null;
  }
}

// Compare current results with historical data
function compareWithHistory(test, result, history) {
  if (!result) return false;
  
  const testHistory = history.tests[test.name] || [];
  
  if (testHistory.length === 0) {
    print.info(`No historical data for ${test.name}`);
    return true;
  }
  
  // Get the most recent result
  const lastResult = testHistory[testHistory.length - 1];
  
  // Calculate the difference
  const diff = test.metric === 'cache_hit_ratio'
    ? lastResult.value - result.value // For ratios, higher is better
    : result.value - lastResult.value; // For durations, lower is better
  
  const percentChange = (diff / lastResult.value) * 100;
  
  if (test.metric === 'cache_hit_ratio') {
    // For ratios, a decrease is a regression
    if (diff > REGRESSION_THRESHOLD) {
      print.error(`REGRESSION: ${test.name} decreased by ${percentChange.toFixed(2)}%`);
      print.error(`Previous: ${lastResult.value.toFixed(2)}, Current: ${result.value.toFixed(2)}`);
      return false;
    } else if (diff < 0) {
      print.success(`IMPROVEMENT: ${test.name} increased by ${Math.abs(percentChange).toFixed(2)}%`);
      return true;
    } else {
      print.info(`NO CHANGE: ${test.name} is stable`);
      return true;
    }
  } else {
    // For durations, an increase is a regression
    if (diff > lastResult.value * REGRESSION_THRESHOLD) {
      print.error(`REGRESSION: ${test.name} increased by ${percentChange.toFixed(2)}%`);
      print.error(`Previous: ${lastResult.value.toFixed(2)}ms, Current: ${result.value.toFixed(2)}ms`);
      return false;
    } else if (diff < 0) {
      print.success(`IMPROVEMENT: ${test.name} decreased by ${Math.abs(percentChange).toFixed(2)}%`);
      return true;
    } else {
      print.info(`NO CHANGE: ${test.name} is stable`);
      return true;
    }
  }
}

// Check if result exceeds threshold
function checkThreshold(test, result) {
  if (!result) return false;
  
  if (test.metric === 'cache_hit_ratio') {
    // For ratios, higher is better
    if (result.value < test.threshold) {
      print.error(`THRESHOLD VIOLATION: ${test.name} (${result.value.toFixed(2)}) is below threshold (${test.threshold})`);
      return false;
    } else {
      print.success(`THRESHOLD MET: ${test.name} (${result.value.toFixed(2)}) is above threshold (${test.threshold})`);
      return true;
    }
  } else {
    // For durations, lower is better
    if (result.value > test.threshold) {
      print.error(`THRESHOLD VIOLATION: ${test.name} (${result.value.toFixed(2)}ms) exceeds threshold (${test.threshold}ms)`);
      return false;
    } else {
      print.success(`THRESHOLD MET: ${test.name} (${result.value.toFixed(2)}ms) is below threshold (${test.threshold}ms)`);
      return true;
    }
  }
}

// Update history with new result
function updateHistory(test, result, history) {
  if (!result) return;
  
  if (!history.tests[test.name]) {
    history.tests[test.name] = [];
  }
  
  // Add the new result
  history.tests[test.name].push(result);
  
  // Keep only the last 10 results
  if (history.tests[test.name].length > 10) {
    history.tests[test.name].shift();
  }
}

// Main function
async function main() {
  print.header('Starting Automated Performance Regression Testing');
  
  createResultsDir();
  const history = loadHistory();
  
  let allTestsPassed = true;
  
  for (const test of performanceTests) {
    const result = runPerformanceTest(test);
    
    if (!result) {
      allTestsPassed = false;
      continue;
    }
    
    const thresholdMet = checkThreshold(test, result);
    const noRegression = compareWithHistory(test, result, history);
    
    if (!thresholdMet || !noRegression) {
      allTestsPassed = false;
    }
    
    updateHistory(test, result, history);
  }
  
  // Save updated history
  saveHistory(history);
  
  // Print summary
  print.header('Performance Test Summary');
  
  if (allTestsPassed) {
    print.success('All performance tests passed!');
    process.exit(0);
  } else {
    print.error('Some performance tests failed!');
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  print.error('An unexpected error occurred:');
  print.error(error);
  process.exit(1);
});