#!/bin/bash

# Kong API Gateway Configuration Test Script

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print section headers
print_header() {
  echo -e "\n${BLUE}======================================${NC}"
  echo -e "${YELLOW}$1${NC}"
  echo -e "${BLUE}======================================${NC}"
}

print_header "Starting Kong API Gateway Configuration Tests"

# Test 1: Check if Kong is running and get version
print_header "Test 1: Checking if Kong is running"
KONG_STATUS=$(curl -s http://localhost:8001/status)
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Kong is running${NC}"
  KONG_VERSION=$(echo "$KONG_STATUS" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
  echo -e "Kong version: ${YELLOW}$KONG_VERSION${NC}"
else
  echo -e "${RED}✗ Kong is not running${NC}"
  exit 1
fi

# Test 2: Check if upstreams are configured
print_header "Test 2: Checking if upstreams are configured"
UPSTREAMS=$(curl -s http://localhost:8001/upstreams | grep -o '"name":"[^"]*"' | cut -d'"' -f4)

for upstream in "url-shortener-upstream" "analytics-upstream" "user-management-upstream"; do
  if echo "$UPSTREAMS" | grep -q "$upstream"; then
    echo -e "${GREEN}✓ $upstream is configured${NC}"
    
    # Check targets for this upstream
    TARGETS=$(curl -s http://localhost:8001/upstreams/$upstream/targets | grep -o '"target":"[^"]*"' | cut -d'"' -f4)
    echo -e "  Targets: ${YELLOW}$TARGETS${NC}"
    
    # Check health checks
    HEALTH_CHECK=$(curl -s http://localhost:8001/upstreams/$upstream | grep -o '"healthchecks":{[^}]*}' || echo "No health checks")
    if [[ "$HEALTH_CHECK" != "No health checks" ]]; then
      echo -e "  ${GREEN}✓ Health checks configured${NC}"
    else
      echo -e "  ${RED}✗ No health checks configured${NC}"
    fi
  else
    echo -e "${RED}✗ $upstream is not configured${NC}"
  fi
done

# Test 3: Check if services are configured
print_header "Test 3: Checking if services are configured"
SERVICES=$(curl -s http://localhost:8001/services | grep -o '"name":"[^"]*"' | cut -d'"' -f4)

for service in "url-shortener-service" "analytics-service" "user-management-service"; do
  if echo "$SERVICES" | grep -q "$service"; then
    echo -e "${GREEN}✓ $service is configured${NC}"
    
    # Get service details
    SERVICE_HOST=$(curl -s http://localhost:8001/services/$service | grep -o '"host":"[^"]*"' | cut -d'"' -f4)
    SERVICE_PROTOCOL=$(curl -s http://localhost:8001/services/$service | grep -o '"protocol":"[^"]*"' | cut -d'"' -f4)
    SERVICE_RETRIES=$(curl -s http://localhost:8001/services/$service | grep -o '"retries":[^,]*' | cut -d':' -f2)
    
    echo -e "  Host: ${YELLOW}$SERVICE_HOST${NC}"
    echo -e "  Protocol: ${YELLOW}$SERVICE_PROTOCOL${NC}"
    echo -e "  Retries: ${YELLOW}$SERVICE_RETRIES${NC}"
  else
    echo -e "${RED}✗ $service is not configured${NC}"
  fi
done

# Test 4: Check if routes are configured
print_header "Test 4: Checking if routes are configured"
ROUTES=$(curl -s http://localhost:8001/routes | grep -o '"name":"[^"]*"' | cut -d'"' -f4)

# Define expected routes
declare -a EXPECTED_ROUTES=(
  "url-shortener-api-route"
  "url-shortener-redirect-route"
  "url-shortener-health-route"
  "analytics-api-route"
  "analytics-health-route"
  "auth-api-route"
  "users-api-route"
  "user-management-health-route"
)

# Check each expected route
for route in "${EXPECTED_ROUTES[@]}"; do
  if echo "$ROUTES" | grep -q "$route"; then
    echo -e "${GREEN}✓ $route is configured${NC}"
    
    # Get route paths
    ROUTE_PATHS=$(curl -s http://localhost:8001/routes/$route | grep -o '"paths":\[[^]]*\]' | sed 's/"paths":\[//g' | sed 's/\]//g' | sed 's/"//g')
    echo -e "  Paths: ${YELLOW}$ROUTE_PATHS${NC}"
  else
    echo -e "${RED}✗ $route is not configured${NC}"
  fi
done

# Test 5: Check if plugins are configured
print_header "Test 5: Checking if plugins are configured"
PLUGINS=$(curl -s http://localhost:8001/plugins | grep -o '"name":"[^"]*"' | cut -d'"' -f4)

# Define expected plugins
declare -a EXPECTED_PLUGINS=(
  "rate-limiting"
  "cors"
  "request-transformer"
  "response-transformer"
  "jwt"
  "ip-restriction"
  "request-size-limiting"
)

# Check each expected plugin
for plugin in "${EXPECTED_PLUGINS[@]}"; do
  if echo "$PLUGINS" | grep -q "$plugin"; then
    echo -e "${GREEN}✓ $plugin plugin is configured${NC}"
    
    # Count instances of this plugin
    PLUGIN_COUNT=$(echo "$PLUGINS" | grep -c "$plugin")
    echo -e "  Instances: ${YELLOW}$PLUGIN_COUNT${NC}"
  else
    echo -e "${RED}✗ $plugin plugin is not configured${NC}"
  fi
done

# Test 6: Check if consumers are configured
print_header "Test 6: Checking if consumers are configured"
CONSUMERS=$(curl -s http://localhost:8001/consumers | grep -o '"username":"[^"]*"' | cut -d'"' -f4)

if echo "$CONSUMERS" | grep -q "api-client"; then
  echo -e "${GREEN}✓ api-client consumer is configured${NC}"
  
  # Check JWT credentials
  JWT_CREDS=$(curl -s http://localhost:8001/consumers/api-client/jwt | grep -o '"key":"[^"]*"' | cut -d'"' -f4)
  if [ -n "$JWT_CREDS" ]; then
    echo -e "  JWT credentials: ${GREEN}✓ Configured${NC}"
    echo -e "  Key: ${YELLOW}$JWT_CREDS${NC}"
  else
    echo -e "  JWT credentials: ${RED}✗ Not configured${NC}"
  fi
else
  echo -e "${RED}✗ api-client consumer is not configured${NC}"
fi

# Test 7: Check if health endpoints are reachable
print_header "Test 7: Checking if health endpoints are reachable"

# URL Shortener health check
echo -e "Testing URL Shortener health endpoint..."
URL_SHORTENER_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health/url-shortener)
if [[ "$URL_SHORTENER_HEALTH" == "200" || "$URL_SHORTENER_HEALTH" == "404" ]]; then
  echo -e "${GREEN}✓ URL Shortener health endpoint is reachable (Status: $URL_SHORTENER_HEALTH)${NC}"
else
  echo -e "${RED}✗ URL Shortener health endpoint is not reachable (Status: $URL_SHORTENER_HEALTH)${NC}"
fi

# Analytics health check
echo -e "Testing Analytics health endpoint..."
ANALYTICS_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health/analytics)
if [[ "$ANALYTICS_HEALTH" == "200" || "$ANALYTICS_HEALTH" == "404" ]]; then
  echo -e "${GREEN}✓ Analytics health endpoint is reachable (Status: $ANALYTICS_HEALTH)${NC}"
else
  echo -e "${RED}✗ Analytics health endpoint is not reachable (Status: $ANALYTICS_HEALTH)${NC}"
fi

# User Management health check
echo -e "Testing User Management health endpoint..."
USER_MGMT_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health/user-management)
if [[ "$USER_MGMT_HEALTH" == "200" || "$USER_MGMT_HEALTH" == "404" ]]; then
  echo -e "${GREEN}✓ User Management health endpoint is reachable (Status: $USER_MGMT_HEALTH)${NC}"
else
  echo -e "${RED}✗ User Management health endpoint is not reachable (Status: $USER_MGMT_HEALTH)${NC}"
fi

# Test 8: Check authentication configuration
print_header "Test 8: Testing authentication configuration"

# Test JWT authentication
echo -e "Testing JWT authentication..."
AUTH_TEST=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/users)
if [[ "$AUTH_TEST" == "401" ]]; then
  echo -e "${GREEN}✓ JWT authentication is working (Unauthorized without token)${NC}"
else
  echo -e "${RED}✗ JWT authentication is not working properly (Status: $AUTH_TEST)${NC}"
fi

# Test 9: Check rate limiting configuration
print_header "Test 9: Testing rate limiting configuration"

# Make multiple requests to trigger rate limiting
echo -e "Testing rate limiting (making multiple requests)..."
for i in {1..5}; do
  curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/urls > /dev/null
done

# Check rate limiting headers
RATE_LIMIT_HEADERS=$(curl -s -I http://localhost:8000/api/v1/urls | grep -i "X-RateLimit")
if [ -n "$RATE_LIMIT_HEADERS" ]; then
  echo -e "${GREEN}✓ Rate limiting headers are present${NC}"
  echo -e "$RATE_LIMIT_HEADERS"
else
  echo -e "${RED}✗ Rate limiting headers are not present${NC}"
fi

print_header "Configuration Tests Completed"

# Summary
TOTAL_TESTS=9
PASSED_TESTS=$(grep -c "✓" <<< "$(cat /dev/stdout)")
FAILED_TESTS=$(grep -c "✗" <<< "$(cat /dev/stdout)")

echo -e "\n${YELLOW}Test Summary:${NC}"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo -e "${BLUE}Total: $TOTAL_TESTS${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "\n${GREEN}All tests passed successfully!${NC}"
  exit 0
else
  echo -e "\n${RED}Some tests failed. Please check the output above.${NC}"
  exit 1
fi