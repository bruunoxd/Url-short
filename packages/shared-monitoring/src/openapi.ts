import { Request, Response, NextFunction } from 'express';
import { OpenAPIV3 } from 'openapi-types';
import path from 'path';
import fs from 'fs';
import { ApiVersion } from '@url-shortener/shared-types';
import swaggerUi from 'swagger-ui-express';

// Cache for OpenAPI specs by version
const openApiSpecCache = new Map<ApiVersion, OpenAPIV3.Document>();

/**
 * Loads OpenAPI specification for a specific API version
 * 
 * @param version API version
 * @param specPath Path to OpenAPI specification file
 * @returns OpenAPI specification
 */
export function loadOpenApiSpec(version: ApiVersion, specPath?: string): OpenAPIV3.Document {
  // Check if spec is already cached
  if (openApiSpecCache.has(version)) {
    return openApiSpecCache.get(version)!;
  }
  
  // Determine spec path
  const defaultSpecPath = path.join(process.cwd(), 'api-docs', `${version}`, 'combined.json');
  const finalSpecPath = specPath || defaultSpecPath;
  
  try {
    // Load spec from file
    const specContent = fs.readFileSync(finalSpecPath, 'utf-8');
    const spec = JSON.parse(specContent) as OpenAPIV3.Document;
    
    // Cache spec
    openApiSpecCache.set(version, spec);
    
    return spec;
  } catch (error) {
    throw new Error(`Failed to load OpenAPI spec for version ${version}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Middleware to serve OpenAPI documentation
 * 
 * @param options Configuration options
 * @returns Express middleware
 */
export function serveApiDocs(options: {
  path?: string;
  versions?: ApiVersion[];
  defaultVersion?: ApiVersion;
  specDir?: string;
  uiOptions?: swaggerUi.SwaggerUiOptions;
}) {
  const {
    path: docsPath = '/api-docs',
    versions = Object.values(ApiVersion),
    defaultVersion = ApiVersion.V1,
    specDir = path.join(process.cwd(), 'api-docs'),
    uiOptions = {},
  } = options;
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Check if request is for API documentation
    if (req.path === docsPath || req.path.startsWith(`${docsPath}/`)) {
      // Get requested version from path or query parameter
      let requestedVersion = defaultVersion;
      
      // Check path for version
      const versionMatch = req.path.match(new RegExp(`${docsPath}/v(\\d+)$`));
      if (versionMatch && versionMatch[1]) {
        requestedVersion = `v${versionMatch[1]}` as ApiVersion;
      }
      
      // Check query parameter for version
      if (req.query.version && typeof req.query.version === 'string') {
        requestedVersion = req.query.version.toLowerCase() as ApiVersion;
      }
      
      // Validate requested version
      if (!versions.includes(requestedVersion)) {
        requestedVersion = defaultVersion;
      }
      
      try {
        // Load OpenAPI spec for requested version
        const spec = loadOpenApiSpec(requestedVersion, path.join(specDir, requestedVersion, 'combined.json'));
        
        // If request is for JSON spec
        if (req.path === `${docsPath}/spec.json` || req.path === `${docsPath}/${requestedVersion}/spec.json`) {
          return res.json(spec);
        }
        
        // If request is for YAML spec
        if (req.path === `${docsPath}/spec.yaml` || req.path === `${docsPath}/${requestedVersion}/spec.yaml`) {
          const yaml = require('js-yaml');
          return res.type('text/yaml').send(yaml.dump(spec));
        }
        
        // Otherwise serve Swagger UI
        const html = generateSwaggerHtml(spec, requestedVersion, versions, docsPath, uiOptions);
        return res.type('html').send(html);
      } catch (error) {
        return res.status(404).json({
          error: `API documentation for version ${requestedVersion} not found`,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    next();
  };
}

/**
 * Generates HTML for Swagger UI
 * 
 * @param spec OpenAPI specification
 * @param currentVersion Current API version
 * @param availableVersions Available API versions
 * @param basePath Base path for API documentation
 * @param uiOptions Swagger UI options
 * @returns HTML for Swagger UI
 */
function generateSwaggerHtml(
  spec: OpenAPIV3.Document,
  currentVersion: ApiVersion,
  availableVersions: ApiVersion[],
  basePath: string,
  uiOptions: swaggerUi.SwaggerUiOptions
): string {
  // Generate version selector options
  const versionOptions = availableVersions
    .map(version => `<option value="${version}" ${version === currentVersion ? 'selected' : ''}>${version}</option>`)
    .join('');
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${spec.info.title} - ${currentVersion}</title>
      <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@4/swagger-ui.css">
      <style>
        body { margin: 0; padding: 0; }
        .swagger-ui .topbar { display: none; }
        .version-selector {
          background-color: #1b1b1b;
          padding: 10px;
          display: flex;
          align-items: center;
          color: white;
        }
        .version-selector select {
          margin-left: 10px;
          padding: 5px;
          border-radius: 4px;
        }
      </style>
    </head>
    <body>
      <div class="version-selector">
        <span>API Version:</span>
        <select id="version-select" onchange="changeVersion(this.value)">
          ${versionOptions}
        </select>
      </div>
      <div id="swagger-ui"></div>
      <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@4/swagger-ui-bundle.js"></script>
      <script>
        window.onload = function() {
          const ui = SwaggerUIBundle({
            spec: ${JSON.stringify(spec)},
            dom_id: "#swagger-ui",
            deepLinking: true,
            presets: [
              SwaggerUIBundle.presets.apis,
              SwaggerUIBundle.SwaggerUIStandalonePreset
            ],
            layout: "BaseLayout",
            ...${JSON.stringify(uiOptions)}
          });
          window.ui = ui;
        }
        
        function changeVersion(version) {
          window.location.href = "${basePath}/" + version;
        }
      </script>
    </body>
    </html>
  `;
}