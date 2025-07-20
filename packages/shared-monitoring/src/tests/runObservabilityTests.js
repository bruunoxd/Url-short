#!/usr/bin/env node

const { execSync } = require('child_process');

try {
  console.log('Running logging tests...');
  execSync('npx vitest run src/tests/logging.test.ts', { stdio: 'inherit' });
  
  console.log('Running tracing tests...');
  execSync('npx vitest run src/tests/tracing.test.ts', { stdio: 'inherit' });
  
  console.log('Observability tests completed successfully!');
} catch (error) {
  console.error('Observability tests failed:', error.message);
  process.exit(1);
}