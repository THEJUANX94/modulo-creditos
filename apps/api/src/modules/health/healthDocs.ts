import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { errores, respuestaJson, sobreExito } from '../../docs/ayudasDocs';

export function registrarDocsHealth(registro: OpenAPIRegistry): void {
  registro.registerPath({
    method: 'get',
    path: '/api/health',
    tags: ['Health'],
    summary: 'Liveness: el proceso responde (no toca la BD)',
    responses: {
      200: respuestaJson('Vivo', sobreExito(z.object({ estado: z.literal('ok') }))),
    },
  });

  registro.registerPath({
    method: 'get',
    path: '/api/health/ready',
    tags: ['Health'],
    summary: 'Readiness: la BD responde',
    responses: {
      200: respuestaJson(
        'Lista para atender',
        sobreExito(z.object({ estado: z.literal('ok'), baseDatos: z.literal('ok') })),
      ),
      ...errores('BD_NO_DISPONIBLE'),
    },
  });
}
