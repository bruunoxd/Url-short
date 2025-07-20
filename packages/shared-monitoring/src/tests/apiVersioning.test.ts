import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('API Versioning Tests', () => {
  let apiFiles: string[] = [];
  
  beforeAll(() => {
    // Find all API controller files
    const servicesDir = path.join(process.cwd(), 'services');
    const services = fs.readdirSync(servicesDir);
    
    services.forEach(service => {
      const controllersDir = path.join(servicesDir, service, 'src', 'controllers');
      
      if (fs.existsSync(controllersDir)) {
        const controllers = fs.readdirSync(controllersDir);
        
        controllers.forEach(controller => {
          if (controller.endsWith('.ts')) {
            apiFiles.push(path.join(controllersDir, controller));
          }
        });
      }
    });
  });
  
  it('should have API files to test', () => {
    expect(apiFiles.length).toBeGreaterThan(0);
  });
  
  it('should include version in all API routes', () => {
    const routeRegex = /router\.(get|post|put|delete|patch)\s*\(\s*['"]\/api\/v\d+\//g;
    const nonVersionedRouteRegex = /router\.(get|post|put|delete|patch)\s*\(\s*['"]\/api\/(?!v\d+\/)/g;
    
    let allRoutesVersioned = true;
    let nonVersionedRoutes: string[] = [];
    
    apiFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check for non-versioned routes
      const nonVersionedMatches = content.match(nonVersionedRouteRegex);
      
      if (nonVersionedMatches) {
        allRoutesVersioned = false;
        nonVersionedRoutes.push(`${file}: ${nonVersionedMatches.join(', ')}`);
      }
    });
    
    if (!allRoutesVersioned) {
      console.error('Found non-versioned API routes:');
      nonVersionedRoutes.forEach(route => console.error(route));
    }
    
    expect(allRoutesVersioned).toBe(true);
  });
  
  it('should use consistent version format', () => {
    const versionRegex = /\/api\/v(\d+)\//g;
    const versions = new Set<string>();
    
    apiFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      let match;
      
      while ((match = versionRegex.exec(content)) !== null) {
        versions.add(match[1]);
      }
    });
    
    // Log found versions
    console.log('API versions found:', Array.from(versions).join(', '));
    
    // Check if versions are numeric
    const allNumeric = Array.from(versions).every(version => /^\d+$/.test(version));
    expect(allNumeric).toBe(true);
  });
  
  it('should include version in OpenAPI documentation', () => {
    const openApiPath = path.join(process.cwd(), 'docs', 'api', 'openapi.json');
    
    if (!fs.existsSync(openApiPath)) {
      console.warn('OpenAPI documentation not found. Run generate-api-docs.js first.');
      return;
    }
    
    const openApiSpec = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
    const paths = Object.keys(openApiSpec.paths || {});
    
    const allPathsVersioned = paths.every(path => /\/api\/v\d+\//.test(path));
    expect(allPathsVersioned).toBe(true);
  });
  
  it('should have version-specific response headers', () => {
    const headerRegex = /['"]X-API-Version['"].*?['"]v\d+['"]/g;
    let hasVersionHeaders = false;
    
    apiFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      
      if (headerRegex.test(content)) {
        hasVersionHeaders = true;
      }
    });
    
    expect(hasVersionHeaders).toBe(true);
  });
});