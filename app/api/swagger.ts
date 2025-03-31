import { createSwaggerSpec } from 'next-swagger-doc';

// Define the basic OpenAPI definition
export const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Plugged.in App API',
    version: '1.0.0', // Consider linking this to package.json version
    description: 'API documentation for the Plugged.in web application backend, managing MCP servers, tools, profiles, and projects.',
  },
  components: {
    securitySchemes: {
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'Authorization', // Standard header for Bearer tokens (API Keys)
        description: 'API Key obtained from the Plugged.in App settings (use format: Bearer YOUR_API_KEY)',
      },
    },
  },
  security: [ // Apply security globally
    {
      apiKey: [],
    },
  ],
  // Define servers if applicable (e.g., for different environments)
  // servers: [
  //   {
  //     url: '/api', // Base path for API routes
  //     description: 'Development server',
  //   },
  // ],
};

/**
 * Generates the OpenAPI specification object.
 * It scans the specified API folder for JSDoc comments with @swagger tags.
 * @returns {Promise<Record<string, any>>} A promise that resolves to the generated OpenAPI spec object.
 */
export const getApiDocs = async (): Promise<Record<string, any>> => {
  const spec = createSwaggerSpec({
    apiFolder: 'app/api', // Target folder for scanning routes
    definition: swaggerDefinition,
  });
  return spec;
};
