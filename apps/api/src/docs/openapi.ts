import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { config } from '../config/config';
import { registrarDocsAuth } from '../modules/auth/authDocs';
import { registrarDocsCatalogos } from '../modules/catalogos/catalogosDocs';
import { registrarDocsCreditos } from '../modules/creditos/creditosDocs';
import { registrarDocsHealth } from '../modules/health/healthDocs';
import { registrarDocsUsuarios } from '../modules/usuarios/usuariosDocs';
import { registrarDocsWebhooks } from '../modules/webhooks/webhooksDocs';

// OpenAPI 3.1 generado desde los mismos esquemas Zod que validan la API (ADR 0007): la
// documentación no se desincroniza de lo que la API acepta y devuelve.
export function generarDocumentoOpenApi() {
  const registro = new OpenAPIRegistry();
  registro.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'El accessToken de POST /api/auth/login (dura 15 minutos)',
  });

  registrarDocsHealth(registro);
  registrarDocsAuth(registro);
  registrarDocsUsuarios(registro);
  registrarDocsCatalogos(registro);
  registrarDocsCreditos(registro);
  registrarDocsWebhooks(registro);

  return new OpenApiGeneratorV31(registro.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Módulo de Créditos — API',
      version: '0.1.0',
      description:
        'Solicitudes de crédito de asociados de una entidad del sector financiero solidario. ' +
        'Errores con el formato { success: false, error: { code, message, details? }, requestId }.',
    },
    servers: [{ url: '/' }],
  });
}

// Swagger UI en /api/docs y el JSON en /api/docs/openapi.json. Se apaga con DOCS_HABILITADA=false
// en un despliegue real, para no publicar el mapa de la API.
export function montarDocumentacion(app: Express): void {
  if (!config.docsHabilitada) return;

  const documento = generarDocumentoOpenApi();
  app.get('/api/docs/openapi.json', (_req, res) => {
    res.json(documento);
  });
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(documento, { customSiteTitle: 'Módulo de Créditos — API' }),
  );
}
