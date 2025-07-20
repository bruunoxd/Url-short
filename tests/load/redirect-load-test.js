import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics
const errorRate = new Rate('errors');
const redirectLatency = new Trend('redirect_latency');

// Test configuration
export const options = {
  scenarios: {
    // Ramp-up to 10,000 RPS
    ramp_up: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 5000,
      stages: [
        { target: 1000, duration: '30s' },  // Ramp up to 1,000 RPS
        { target: 5000, duration: '30s' },  // Ramp up to 5,000 RPS
        { target: 10000, duration: '30s' }, // Ramp up to 10,000 RPS
        { target: 10000, duration: '60s' }, // Stay at 10,000 RPS for 1 minute
        { target: 0, duration: '30s' },     // Ramp down to 0 RPS
      ],
    },
    // Constant load at 5,000 RPS
    constant_load: {
      executor: 'constant-arrival-rate',
      rate: 5000,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 100,
      maxVUs: 3000,
    },
    // Stress test with increasing load
    stress_test: {
      executor: 'ramping-arrival-rate',
      startRate: 1000,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 10000,
      stages: [
        { target: 5000, duration: '1m' },
        { target: 10000, duration: '1m' },
        { target: 15000, duration: '1m' },
        { target: 20000, duration: '1m' },
        { target: 0, duration: '30s' },
      ],
    },
  },
  thresholds: {
    'redirect_latency': [
      // 95% of requests should be below 100ms
      { threshold: 'p(95)<100', abortOnFail: true },
      // 99% of requests should be below 200ms
      { threshold: 'p(99)<200', abortOnFail: true },
    ],
    'errors': [
      // Error rate should be less than 1%
      { threshold: 'rate<0.01', abortOnFail: true },
    ],
    'http_req_duration': [
      // 95% of requests should be below 100ms
      { threshold: 'p(95)<100', abortOnFail: true },
    ],
  },
};

// Sample short URLs for testing
const shortCodes = [
  'abc123',
  'def456',
  'ghi789',
  'jkl012',
  'mno345',
  'pqr678',
  'stu901',
  'vwx234',
  'yz5678',
  'test90',
];

// Main test function
export default function() {
  // Select a random short code
  const shortCode = randomItem(shortCodes);
  
  // Record start time for custom latency metric
  const startTime = new Date();
  
  // Make the request
  const res = http.get(`http://localhost:3000/${shortCode}`);
  
  // Record latency
  const latency = new Date() - startTime;
  redirectLatency.add(latency);
  
  // Check if the response is a redirect (status code 301 or 302)
  const isRedirect = res.status === 301 || res.status === 302;
  
  // Record success or failure
  errorRate.add(!isRedirect);
  
  // Verify the response
  check(res, {
    'is redirect': () => isRedirect,
    'has location header': () => res.headers.Location !== undefined,
  });
  
  // Small sleep to prevent overwhelming the system
  sleep(0.01);
}

// Setup function - runs once at the beginning of the test
export function setup() {
  console.log('Starting load test for URL shortener redirect service');
  
  // Check if the service is available
  const res = http.get('http://localhost:3000/health');
  if (res.status !== 200) {
    console.error('Health check failed. Make sure the service is running.');
    return;
  }
  
  console.log('Service is available. Starting test...');
}

// Teardown function - runs once at the end of the test
export function teardown(data) {
  console.log('Load test completed');
}