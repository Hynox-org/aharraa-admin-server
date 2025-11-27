const fs = require('fs');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Aharraa API',
      version: '0.1.0',
      description: 'Auto-generated OpenAPI spec for Aharraa server',
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 4000}`,
      },
    ],
  },
  apis: [path.join(__dirname, './routes/*.js')],
};

const outputDir = path.join(process.cwd(), 'docs');
const outputFile = path.join(outputDir, 'openapi.json');

try {
  const spec = swaggerJsdoc(options);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(spec, null, 2));
  console.log('OpenAPI spec written to', outputFile);
} catch (err) {
  console.error('Failed to generate OpenAPI spec', err);
  process.exit(1);
}
