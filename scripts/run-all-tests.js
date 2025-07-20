#!/usr/bin/env node

/**
 * Comprehensive test runner script for the URL shortener platform
 * This script runs all tests across the monorepo with coverage reporting
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const COVERAGE_THRESHOLD = 80; // Minimum coverage percentage required
const TEST_TIMEOUT = 60000; // 60 seconds timeout for tests

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

// Get all workspace packages
function getWorkspaces() {
  const rootPackageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  const workspaces = [];
  
  // Add frontend
  workspaces.push('frontend');
  
  // Add services
  fs.readdirSync(path.join(process.cwd(), 'services')).forEach(service => {
    workspaces.push(`services/${service}`);
  });
  
  // Add packages
  fs.readdirSync(path.join(process.cwd(), 'packages')).forEach(pkg => {
    workspaces.push(`packages/${pkg}`);
  });
  
  return workspaces;
}

// Run tests for a specific workspace
function runTests(workspace) {
  print.header(`Running tests for ${workspace}`);
  
  try {
    // Check if package.json exists
    const packageJsonPath = path.join(process.cwd(), workspace, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      print.warning(`No package.json found in ${workspace}, skipping...`);
      return { success: true, coverage: null };
    }
    
    // Check if the package has tests
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    if (!packageJson.scripts || !packageJson.scripts.test) {
      print.warning(`No test script found in ${workspace}, skipping...`);
      return { success: true, coverage: null };
    }
    
    // Determine test command based on the package
    let testCommand;
    if (workspace === 'frontend') {
      testCommand = 'jest --coverage --ci';
    } else {
      testCommand = 'vitest run --coverage';
    }
    
    // Run the tests
    print.info(`Running: ${testCommand}`);
    execSync(`cd ${workspace} && ${testCommand}`, { 
      stdio: 'inherit',
      timeout: TEST_TIMEOUT
    });
    
    // Parse coverage report if available
    let coverage = null;
    const coverageSummaryPath = path.join(process.cwd(), workspace, 'coverage', 'coverage-summary.json');
    
    if (fs.existsSync(coverageSummaryPath)) {
      const coverageSummary = JSON.parse(fs.readFileSync(coverageSummaryPath, 'utf8'));
      coverage = coverageSummary.total.lines.pct;
      
      if (coverage < COVERAGE_THRESHOLD) {
        print.warning(`Coverage for ${workspace} is ${coverage}%, which is below the threshold of ${COVERAGE_THRESHOLD}%`);
      } else {
        print.success(`Coverage for ${workspace} is ${coverage}%`);
      }
    }
    
    return { success: true, coverage };
  } catch (error) {
    print.error(`Tests failed for ${workspace}`);
    print.error(error.message);
    return { success: false, coverage: null };
  }
}

// Main function
async function main() {
  print.header('Starting comprehensive test run');
  
  const workspaces = getWorkspaces();
  print.info(`Found ${workspaces.length} workspaces to test`);
  
  const results = {};
  let allTestsPassed = true;
  
  for (const workspace of workspaces) {
    const result = runTests(workspace);
    results[workspace] = result;
    
    if (!result.success) {
      allTestsPassed = false;
    }
  }
  
  // Print summary
  print.header('Test Summary');
  
  let totalCoverage = 0;
  let coverageCount = 0;
  
  for (const [workspace, result] of Object.entries(results)) {
    const status = result.success ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`;
    const coverage = result.coverage !== null ? `${result.coverage}%` : 'N/A';
    
    console.log(`${workspace}: ${status} (Coverage: ${coverage})`);
    
    if (result.coverage !== null) {
      totalCoverage += result.coverage;
      coverageCount++;
    }
  }
  
  if (coverageCount > 0) {
    const averageCoverage = totalCoverage / coverageCount;
    const coverageStatus = averageCoverage >= COVERAGE_THRESHOLD ? colors.green : colors.yellow;
    
    print.header('Coverage Summary');
    console.log(`Average coverage: ${coverageStatus}${averageCoverage.toFixed(2)}%${colors.reset}`);
    console.log(`Coverage threshold: ${COVERAGE_THRESHOLD}%`);
  }
  
  if (allTestsPassed) {
    print.success('\nAll tests passed!');
    process.exit(0);
  } else {
    print.error('\nSome tests failed!');
    process.exit(1);
  }
}

main().catch(error => {
  print.error('An unexpected error occurred:');
  print.error(error);
  process.exit(1);
});