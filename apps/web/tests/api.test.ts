import { esquemaCredito } from '@creditos/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, fijarToken, pedir, registrarCierreSesion, type MotivoCierre } from '@/lib/api';

// Cliente HTTP (ADR 0021): refresh ante un 401, un solo refresh para peticiones simultáneas,
// salida al login por SESION_INVALIDA y validación del contrato de cada respuesta.

const credito = {
  id: '9c41a2b3-c4d5-4e6f-8a7b-9c0d1e2f3a4b',
  numeroCredito: 'CR-2026-000123',
  tipoIdentificacionAsociado: 'CC',
  identificacionAsociado: '1001234567',
  nombreAsociado: 'Juan Perez',
  tipoCredito: 'LIBRE_INVERSION',
  valorSolicitado: '15000000.00',
  tasaInteres: '1.5000',
  numeroCuotas: 36,
  formaPago: 'NOMINA',
  estado: 'SOLICITADO',
  fechaSolicitud: '2026-10-01T15:04:05.123Z',
  fechaActualizacion: '2026-10-01T15:04:05.123Z',
  version: '0x00000000000007E1',
};
const sesion = {
  accessToken: 'token-nuevo',
  expiraEn: '2026-10-01T15:19:05.123Z',
  usuario: {
    id: '1c41a2b3-c4d5-4e6f-8a7b-9c0d1e2f3a4b',
    correo: 'asesor@creditos.test',
    nombre: 'Asesor Demo',
    rol: 'ASESOR',
    debeCambiarContrasena: false,
  },
};

const respuesta = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });
const error401 = (code: string) =>
  respuesta(401, {
    success: false,
    error: { code, message: 'No autenticado' },
    requestId: 'req-1',
  });

let llamadas: { url: string; autorizacion: string | null; csrf: string | null }[];
let cierres: MotivoCierre[];

function simularFetch(responder: (url: string, autorizacion: string | null) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      const encabezados = new Headers(init.headers);
      const autorizacion = encabezados.get('Authorization');
      llamadas.push({ url, autorizacion, csrf: encabezados.get('X-CSRF') });
      return Promise.resolve(responder(url, autorizacion));
    }),
  );
}

beforeEach(() => {
  llamadas = [];
  cierres = [];
  fijarToken('token-viejo');
  registrarCierreSesion((motivo) => cierres.push(motivo));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cliente HTTP', () => {
  it('envía el access token y valida la respuesta con el esquema', async () => {
    simularFetch(() => respuesta(200, { success: true, data: credito }));
    await expect(pedir(`/creditos/${credito.id}`, esquemaCredito)).resolves.toEqual(credito);
    expect(llamadas[0]).toMatchObject({
      url: `/api/creditos/${credito.id}`,
      autorizacion: 'Bearer token-viejo',
    });
  });

  it('un token vencido (401 NO_AUTENTICADO): refresca con el header anti-CSRF y repite la petición', async () => {
    simularFetch((url, autorizacion) => {
      if (url === '/api/auth/refresh') return respuesta(200, { success: true, data: sesion });
      return autorizacion === 'Bearer token-nuevo'
        ? respuesta(200, { success: true, data: credito })
        : error401('NO_AUTENTICADO');
    });
    await expect(pedir('/creditos/x', esquemaCredito)).resolves.toEqual(credito);
    expect(llamadas.map((l) => l.url)).toEqual([
      '/api/creditos/x',
      '/api/auth/refresh',
      '/api/creditos/x',
    ]);
    expect(llamadas[1]?.csrf).toBe('1');
    expect(cierres).toEqual([]);
  });

  it('varias peticiones con 401 a la vez comparten un solo refresh', async () => {
    simularFetch((url, autorizacion) => {
      if (url === '/api/auth/refresh') return respuesta(200, { success: true, data: sesion });
      return autorizacion === 'Bearer token-nuevo'
        ? respuesta(200, { success: true, data: credito })
        : error401('NO_AUTENTICADO');
    });
    await Promise.all([1, 2, 3].map(() => pedir('/creditos/x', esquemaCredito)));
    expect(llamadas.filter((l) => l.url === '/api/auth/refresh')).toHaveLength(1);
  });

  it('SESION_INVALIDA (otro login, desactivación o reuso): no refresca y cierra la sesión', async () => {
    simularFetch(() => error401('SESION_INVALIDA'));
    await expect(pedir('/creditos/x', esquemaCredito)).rejects.toMatchObject({
      codigo: 'SESION_INVALIDA',
    });
    expect(llamadas.map((l) => l.url)).toEqual(['/api/creditos/x']);
    expect(cierres).toEqual(['SESION_INVALIDA']);
  });

  it('si el refresh también falla, la sesión venció', async () => {
    simularFetch(() => error401('NO_AUTENTICADO'));
    await expect(pedir('/creditos/x', esquemaCredito)).rejects.toBeInstanceOf(ErrorApi);
    expect(cierres).toEqual(['SESION_VENCIDA']);
  });

  it('un error de la API conserva código, mensaje, detalles y requestId', async () => {
    simularFetch(() =>
      respuesta(400, {
        success: false,
        error: {
          code: 'VALIDACION_FALLIDA',
          message: 'Datos inválidos',
          details: [{ campo: 'valorSolicitado', mensaje: 'Debe ser mayor que 0' }],
        },
        requestId: 'req-7',
      }),
    );
    await expect(
      pedir('/creditos', esquemaCredito, { metodo: 'POST', cuerpo: {} }),
    ).rejects.toMatchObject({
      status: 400,
      codigo: 'VALIDACION_FALLIDA',
      detalles: [{ campo: 'valorSolicitado', mensaje: 'Debe ser mayor que 0' }],
      requestId: 'req-7',
    });
  });

  it('sin conexión: ERROR_RED con un mensaje que dice qué hacer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(pedir('/creditos/x', esquemaCredito)).rejects.toMatchObject({
      codigo: 'ERROR_RED',
      message: expect.stringContaining('conexión') as unknown,
    });
  });

  it('una respuesta que no cumple el contrato falla en el cliente, no en un componente', async () => {
    simularFetch(() =>
      respuesta(200, { success: true, data: { ...credito, valorSolicitado: 15000000 } }),
    );
    await expect(pedir('/creditos/x', esquemaCredito)).rejects.toThrow();
  });
});
