import { describe, expect, it } from 'vitest';
import { api, fallo } from './apoyo/ayudas';

// Base de la API (ADR 0015) y Swagger (ADR 0017, ADR 0018).

describe('health', () => {
  it('liveness y readiness responden 200 con la BD arriba', async () => {
    expect((await api().get('/api/health')).status).toBe(200);
    expect((await api().get('/api/health/ready')).status).toBe(200);
  });

  it('cada respuesta devuelve su requestId; uno entrante seguro se respeta', async () => {
    const generado = await api().get('/api/health');
    expect(generado.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
    const propio = await api().get('/api/health').set('X-Request-Id', 'prueba-123');
    expect(propio.get('X-Request-Id')).toBe('prueba-123');
  });

  it('una ruta inexistente → 404 RUTA_NO_ENCONTRADA con el formato de error', async () => {
    const res = await api().get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(fallo(res).code).toBe('RUTA_NO_ENCONTRADA');
  });
});

describe('Swagger', () => {
  it('publica las rutas de créditos y de la traza, y el webhook en la sección webhooks', async () => {
    const res = await api().get('/api/docs/openapi.json');
    const documento = res.body as {
      openapi: string;
      paths: Record<string, unknown>;
      webhooks: Record<string, { post: { parameters: { name: string; in: string }[] } }>;
    };
    expect(documento.openapi).toBe('3.1.0');
    expect(Object.keys(documento.paths)).toEqual(
      expect.arrayContaining([
        '/api/creditos',
        '/api/creditos/{id}',
        '/api/creditos/{id}/estado',
        '/api/webhooks/eventos',
        '/api/webhooks/eventos/{eventId}',
      ]),
    );
    const cabeceras = documento.webhooks['credito.creado']?.post.parameters
      .filter((parametro) => parametro.in === 'header')
      .map((parametro) => parametro.name);
    expect(cabeceras).toEqual([
      'webhook-id',
      'webhook-timestamp',
      'webhook-signature',
      'x-request-id',
    ]);
  });
});
