import {
  esquemaDetalleEventoWebhook,
  esquemaEventoWebhook,
  type DetalleEventoWebhook,
} from '@creditos/shared';
import { setTimeout as esperar } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { procesarLote } from '../../src/modules/webhooks/despachadorWebhooks';
import * as webhooksRepository from '../../src/modules/webhooks/webhooksRepository';
import { contextoPeticion } from '../../src/shared/contextoPeticion';
import { prisma } from '../../src/shared/db/prisma';
import { logger } from '../../src/shared/logger';
import {
  api,
  bearer,
  crearCredito,
  ejemploCredito,
  exito,
  fallo,
  identificacionAleatoria,
  iniciarSesion,
  lista,
  pedirCreacion,
  type Sesion,
} from './apoyo/ayudas';
import { ReceptorWebhook, type Accion } from './apoyo/receptorWebhook';

// Integración con el webhook (ADR 0006, ADR 0018): el evento entra al outbox con la creación y el
// despachador del worker lo envía firmado, con reintentos y traza. El despachador corre dentro de
// este proceso, con los valores cortos de vitest.integracion.config.ts (4 intentos, base de 100 ms,
// timeout de 1 s).

const destino = new URL(process.env.WEBHOOK_URL ?? '');
const secreto = Buffer.from((process.env.WEBHOOK_SECRETO ?? '').slice('whsec_'.length), 'base64');
const receptor = new ReceptorWebhook(secreto, Number(destino.port));

let asesor: Sesion;
let admin: Sesion;
let analista: Sesion;

// Lo que esté listo en el outbox, hasta vaciarlo (incluye los eventos que crearon otros archivos).
async function drenar(): Promise<void> {
  while ((await procesarLote()) > 0);
}

const detalle = async (eventId: string): Promise<DetalleEventoWebhook> =>
  exito(
    await api()
      .get(`/api/webhooks/eventos/${eventId}`)
      .set(...bearer(admin.token)),
    esquemaDetalleEventoWebhook,
  );

// Corre el worker hasta que los eventos de estos créditos queden ENTREGADO o FALLIDO. El sondeo
// va directo a la BD, no a la API, para no gastar el rate limit.
async function procesarHastaFinal(
  creditoIds: string[],
  limiteMs = 15_000,
): Promise<DetalleEventoWebhook[]> {
  const inicio = Date.now();
  for (;;) {
    await procesarLote();
    const eventos = await prisma.webhookEventos.findMany({
      where: { creditoId: { in: creditoIds } },
      select: { creditoId: true, eventId: true, estado: true },
    });
    if (eventos.length === creditoIds.length && eventos.every((e) => e.estado !== 'PENDIENTE')) {
      return Promise.all(
        creditoIds.map((id) => {
          const evento = eventos.find((e) => e.creditoId.toLowerCase() === id);
          if (!evento) throw new Error(`Sin evento para ${id}`);
          return detalle(evento.eventId.toLowerCase());
        }),
      );
    }
    if (Date.now() - inicio > limiteMs)
      throw new Error(`Sin estado final: ${JSON.stringify(eventos)}`);
    await esperar(50);
  }
}

// La traza viene de lo más reciente a lo más antiguo: se invierte para leerla en orden.
const resultados = (evento: DetalleEventoWebhook) =>
  [...evento.traza].reverse().map((t) => t.resultado);

async function crearConEscenario(acciones: Accion[]): Promise<string> {
  const identificacion = identificacionAleatoria();
  receptor.escenarios.set(identificacion, [...acciones]);
  return (await crearCredito(asesor.token, { identificacionAsociado: identificacion })).id;
}

beforeAll(async () => {
  [asesor, admin, analista] = await Promise.all([
    iniciarSesion('ASESOR'),
    iniciarSesion('ADMIN'),
    iniciarSesion('ANALISTA'),
  ]);
  await receptor.iniciar();
  await drenar();
});

afterAll(async () => {
  await receptor.detener();
});

describe('registro en la transacción de la creación', () => {
  it('crear un crédito deja un evento PENDIENTE en el outbox, con el requestId de la petición', async () => {
    const res = await pedirCreacion(asesor.token);
    const creditoId = (res.body as { data: { id: string } }).data.id;
    const eventos = lista(
      await api()
        .get(`/api/webhooks/eventos?creditoId=${creditoId}`)
        .set(...bearer(admin.token)),
      esquemaEventoWebhook,
    );
    expect(eventos.data).toHaveLength(1);
    expect(eventos.data[0]).toMatchObject({
      tipoEvento: 'credito.creado',
      estado: 'PENDIENTE',
      intentos: 0,
      requestId: res.get('X-Request-Id'),
    });
    await procesarHastaFinal([creditoId]);
  });

  it('una creación que falla (409 o 422) no deja evento: no hay un segundo INSERT ni lógica aparte', async () => {
    const identificacion = identificacionAleatoria();
    await crearCredito(asesor.token, { identificacionAsociado: identificacion });
    const antes = await prisma.webhookEventos.count();
    const duplicado = await pedirCreacion(asesor.token, { identificacionAsociado: identificacion });
    const otroNombre = await pedirCreacion(asesor.token, {
      identificacionAsociado: identificacion,
      tipoCredito: 'VIVIENDA',
      nombreAsociado: 'Otra Persona',
    });
    expect([duplicado.status, otroNombre.status]).toEqual([409, 422]);
    expect(await prisma.webhookEventos.count()).toBe(antes);
    await drenar();
  });
});

describe('entrega y contrato', () => {
  it('se entrega en el primer intento, firmado, con el payload aprobado y el requestId', async () => {
    const res = await pedirCreacion(asesor.token, {
      identificacionAsociado: identificacionAleatoria(),
    });
    const credito = (
      res.body as {
        data: {
          id: string;
          numeroCredito: string;
          identificacionAsociado: string;
          fechaSolicitud: string;
        };
      }
    ).data;
    const [evento] = await procesarHastaFinal([credito.id]);
    if (!evento) throw new Error('Sin evento');

    expect(evento).toMatchObject({ estado: 'ENTREGADO', intentos: 1, proximoIntento: null });
    expect(evento.fechaEntrega).not.toBeNull();
    expect(resultados(evento)).toEqual(['EXITOSO']);

    const [llegada] = receptor.recibidasDe(evento.eventId);
    if (!llegada) throw new Error('El receptor no lo recibió');
    expect(llegada.firmaValida).toBe(true);
    expect(Math.abs(Date.now() / 1000 - Number(llegada.timestamp))).toBeLessThan(30);
    expect(llegada.datos?.eventId).toBe(evento.eventId);
    expect(llegada.requestId).toBe(res.get('X-Request-Id'));
    expect(llegada.contentType).toBe('application/json');
    expect(llegada.userAgent).toBe('ModuloCreditos-Webhook/0.1');

    const payload = JSON.parse(llegada.cuerpo) as Record<string, unknown> & {
      data: Record<string, unknown>;
    };
    expect(Object.keys(payload)).toEqual(['event', 'eventId', 'timestamp', 'data']);
    expect(payload.data).toEqual({
      id: credito.id,
      numeroCredito: credito.numeroCredito,
      tipoIdentificacionAsociado: 'CC',
      identificacionAsociado: credito.identificacionAsociado,
      tipoCredito: ejemploCredito.tipoCredito,
      valorSolicitado: '15000000.00',
      estado: 'SOLICITADO',
    });
    expect(payload.event).toBe('credito.creado');
    expect(payload.timestamp).toBe(credito.fechaSolicitud);
    // El detalle muestra exactamente lo que se envió.
    expect(JSON.stringify(evento.payload)).toBe(llegada.cuerpo);
  });
});

describe('reintentos y fallas del sistema externo', () => {
  let r: Record<string, DetalleEventoWebhook> = {};

  beforeAll(async () => {
    const escenarios: Record<string, Accion[]> = {
      s503: [503, 503],
      s429y408: [429, 408],
      s400: [{ tipo: 'cuerpo', status: 400, texto: 'contrato inválido: falta el campo X' }],
      sLargo: [{ tipo: 'cuerpo', status: 422, texto: 'x'.repeat(5000) }],
      s302: [{ tipo: 'redirigir' }],
      sLento: [{ tipo: 'lento', ms: 1500 }],
      sCortado: [{ tipo: 'cerrar' }],
    };
    const ids: Record<string, string> = {};
    for (const [nombre, acciones] of Object.entries(escenarios))
      ids[nombre] = await crearConEscenario(acciones);
    const finales = await procesarHastaFinal(Object.values(ids));
    r = Object.fromEntries(
      Object.keys(ids).map((nombre, i) => [nombre, finales[i] as DetalleEventoWebhook]),
    );
  });

  it('503, 503, 200 → ENTREGADO en el tercer intento, con el status y la respuesta de cada fallo', () => {
    expect(r.s503?.estado).toBe('ENTREGADO');
    expect(resultados(r.s503 as DetalleEventoWebhook)).toEqual([
      'ERROR_HTTP',
      'ERROR_HTTP',
      'EXITOSO',
    ]);
    expect(r.s503?.traza.at(-1)).toMatchObject({ statusHttp: 503, error: 'rechazo 503' });
  });

  it('429 y 408 se reintentan', () => {
    expect(r.s429y408?.estado).toBe('ENTREGADO');
    expect([...(r.s429y408?.traza ?? [])].reverse().map((t) => t.statusHttp)).toEqual([
      429, 408, 200,
    ]);
  });

  it('400 → FALLIDO sin reintentos, con el motivo del receptor en la traza', () => {
    expect(r.s400).toMatchObject({ estado: 'FALLIDO', intentos: 1 });
    expect(r.s400?.traza).toHaveLength(1);
    expect(r.s400?.traza[0]?.error).toBe('contrato inválido: falta el campo X');
  });

  it('de una respuesta de 5000 caracteres se guardan 500', () => {
    expect(r.sLargo?.estado).toBe('FALLIDO');
    expect(r.sLargo?.traza[0]?.error).toHaveLength(500);
  });

  it('302 → FALLIDO sin seguir la redirección', () => {
    expect(r.s302?.estado).toBe('FALLIDO');
    expect(r.s302?.traza[0]?.statusHttp).toBe(302);
    expect(receptor.redireccionSeguida).toBe(false);
  });

  it('un receptor lento → TIMEOUT al segundo, y se reintenta', () => {
    expect(r.sLento?.estado).toBe('ENTREGADO');
    expect(resultados(r.sLento as DetalleEventoWebhook)).toEqual(['TIMEOUT', 'EXITOSO']);
    const timeout = r.sLento?.traza.at(-1);
    expect(timeout?.statusHttp).toBeNull();
    expect(timeout?.duracionMs).toBeGreaterThanOrEqual(950);
    expect(timeout?.duracionMs).toBeLessThan(1500);
  });

  it('una conexión cortada → ERROR_RED, y se reintenta', () => {
    expect(r.sCortado?.estado).toBe('ENTREGADO');
    expect(resultados(r.sCortado as DetalleEventoWebhook)).toEqual(['ERROR_RED', 'EXITOSO']);
  });

  it('cada intento manda exactamente el mismo cuerpo, con una firma válida y un número distinto', () => {
    for (const evento of Object.values(r)) {
      const llegadas = receptor.recibidasDe(evento.eventId);
      expect(new Set(llegadas.map((llegada) => llegada.cuerpo)).size).toBe(1);
      expect(llegadas.every((llegada) => llegada.firmaValida)).toBe(true);
      expect(new Set(evento.traza.map((t) => t.numeroIntento)).size).toBe(evento.traza.length);
    }
  });

  it('4 fallas temporales con máximo 4 → FALLIDO, con backoff exponencial entre intentos', async () => {
    const [evento] = await procesarHastaFinal([await crearConEscenario([503, 503, 503, 503])]);
    expect(evento).toMatchObject({ estado: 'FALLIDO', intentos: 4, proximoIntento: null });
    const fechas = [...(evento?.traza ?? [])].reverse().map((t) => Date.parse(t.fecha));
    const esperas = fechas.slice(1).map((fecha, i) => fecha - (fechas[i] ?? 0));
    // Base de 100 ms: 100, 200 y 400 ms, ±20 %, más el sondeo de la prueba (50 ms) y el envío.
    esperas.forEach((espera, i) => {
      expect(espera).toBeGreaterThanOrEqual(100 * 2 ** i * 0.8);
      expect(espera).toBeLessThanOrEqual(100 * 2 ** i * 1.2 + 200);
    });
  });
});

describe('sistema externo fuera de servicio', () => {
  it('con el receptor caído el intento es ERROR_RED (ECONNREFUSED); cuando vuelve, se entrega', async () => {
    await receptor.detener();
    const creditoId = (await crearCredito(asesor.token)).id;
    await procesarLote();
    const evento = await prisma.webhookEventos.findFirstOrThrow({ where: { creditoId } });
    const caido = await detalle(evento.eventId.toLowerCase());
    expect(caido.estado).toBe('PENDIENTE');
    expect(caido.traza[0]).toMatchObject({ resultado: 'ERROR_RED', statusHttp: null });
    expect(caido.traza[0]?.error).toMatch(/ECONNREFUSED/);

    await receptor.iniciar();
    const [vuelta] = await procesarHastaFinal([creditoId]);
    expect(vuelta?.estado).toBe('ENTREGADO');
    expect(resultados(vuelta as DetalleEventoWebhook)).toEqual(['ERROR_RED', 'EXITOSO']);
  });
});

describe('varios workers y lease', () => {
  it('dos workers a la vez se reparten el outbox: ningún evento se envía dos veces', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      ids.push(
        ...(await Promise.all(
          [0, 1, 2, 3, 4].map(async () => (await crearCredito(asesor.token)).id),
        )),
      );
    }
    // Dos reclamos simultáneos sobre 20 eventos listos: READPAST hace que cada uno tome otros 10.
    const tomados = await Promise.all([procesarLote(), procesarLote()]);
    expect(tomados).toEqual([10, 10]);

    const eventos = await procesarHastaFinal(ids);
    expect(eventos.every((evento) => evento.estado === 'ENTREGADO' && evento.intentos === 1)).toBe(
      true,
    );
    for (const evento of eventos) expect(receptor.recibidasDe(evento.eventId)).toHaveLength(1);
  });

  it('un worker que muere con el evento tomado: otro lo retoma al vencer el lease, con un hueco en la traza', async () => {
    await drenar();
    const creditoId = (await crearCredito(asesor.token)).id;
    // Un worker lo toma y "muere": nunca envía ni registra.
    const tomados = await webhooksRepository.reclamar(10, 60);
    expect(tomados).toHaveLength(1);
    const [tomado] = tomados;
    if (!tomado) throw new Error('No se tomó el evento');
    expect(tomado.intentos).toBe(1);
    const propio = await prisma.webhookEventos.findFirstOrThrow({ where: { creditoId } });
    expect(propio.eventId.toLowerCase()).toBe(tomado.eventId);

    // Mientras dura el lease, nadie más lo toma.
    expect(await procesarLote()).toBe(0);
    expect(receptor.recibidasDe(tomado.eventId)).toHaveLength(0);

    // Vence el lease (en vez de esperar 60 s).
    await prisma.$executeRaw`
      UPDATE dbo.WebhookEventos SET proximoIntento = DATEADD(SECOND, -1, SYSUTCDATETIME())
      WHERE id = ${tomado.id}`;
    const [retomado] = await procesarHastaFinal([creditoId]);
    expect(retomado).toMatchObject({ estado: 'ENTREGADO', intentos: 2 });
    expect(retomado?.traza.map((t) => t.numeroIntento)).toEqual([2]);

    // Si el worker "muerto" revive y registra su intento, queda en la traza pero no pisa el estado.
    const vigente = await webhooksRepository.registrarIntento(
      tomado.id,
      1,
      { resultado: 'TIMEOUT', statusHttp: null, duracionMs: 1000, error: 'Sin respuesta' },
      { estado: 'FALLIDO' },
    );
    expect(vigente).toBe(false);
    const final = await detalle(tomado.eventId);
    expect(final.estado).toBe('ENTREGADO');
    expect(final.traza.map((t) => t.numeroIntento)).toEqual([2, 1]);
  });
});

describe('traza en la API (solo ADMIN)', () => {
  it('ANALISTA y ASESOR → 403', async () => {
    expect(
      (
        await api()
          .get('/api/webhooks/eventos')
          .set(...bearer(analista.token))
      ).status,
    ).toBe(403);
    const cualquiera = '00000000-0000-4000-8000-000000000000';
    expect(
      (
        await api()
          .get(`/api/webhooks/eventos/${cualquiera}`)
          .set(...bearer(asesor.token))
      ).status,
    ).toBe(403);
  });

  it('eventId inválido → 400; inexistente → 404 EVENTO_WEBHOOK_NOT_FOUND; estado inválido → 400', async () => {
    expect(
      (
        await api()
          .get('/api/webhooks/eventos/123')
          .set(...bearer(admin.token))
      ).status,
    ).toBe(400);
    const res = await api()
      .get('/api/webhooks/eventos/00000000-0000-4000-8000-000000000000')
      .set(...bearer(admin.token));
    expect(res.status).toBe(404);
    expect(fallo(res).code).toBe('EVENTO_WEBHOOK_NOT_FOUND');
    expect(
      (
        await api()
          .get('/api/webhooks/eventos?estado=OTRO')
          .set(...bearer(admin.token))
      ).status,
    ).toBe(400);
  });

  it('filtro por estado, paginación y lo más reciente primero, sin payload en la lista', async () => {
    const fallidos = lista(
      await api()
        .get('/api/webhooks/eventos?estado=FALLIDO&tamanoPagina=100')
        .set(...bearer(admin.token)),
      esquemaEventoWebhook,
    );
    expect(fallidos.data.length).toBeGreaterThanOrEqual(4);
    expect(fallidos.data.every((evento) => evento.estado === 'FALLIDO')).toBe(true);

    const pagina = lista(
      await api()
        .get('/api/webhooks/eventos?tamanoPagina=2&pagina=2')
        .set(...bearer(admin.token)),
      esquemaEventoWebhook,
    );
    expect(pagina.data).toHaveLength(2);
    expect(pagina.meta.totalPaginas).toBe(Math.ceil(pagina.meta.total / 2));

    const recientes = await api()
      .get('/api/webhooks/eventos?tamanoPagina=5')
      .set(...bearer(admin.token));
    const eventos = lista(recientes, esquemaEventoWebhook).data;
    expect(
      eventos.every((e, i) => i === 0 || e.fechaCreacion <= (eventos[i - 1]?.fechaCreacion ?? '')),
    ).toBe(true);
    expect((recientes.body as { data: object[] }).data.every((e) => !('payload' in e))).toBe(true);
  });
});

describe('logs del worker', () => {
  it('llevan el requestId de la creación, nunca el cuerpo de un rechazo, y FALLIDO sale como error', async () => {
    const llamadas: { nivel: string; requestId: string | undefined; texto: string }[] = [];
    for (const nivel of ['info', 'warn', 'error'] as const) {
      // Solo las líneas del despachador; las del log de acceso traen objetos que no se serializan.
      vi.spyOn(logger, nivel).mockImplementation((...args: unknown[]) => {
        const [datos, mensaje] = args;
        if (typeof mensaje !== 'string' || !mensaje.startsWith('Webhook')) return;
        llamadas.push({
          nivel,
          requestId: contextoPeticion.getStore()?.requestId,
          texto: `${mensaje} ${JSON.stringify(datos)}`,
        });
      });
    }
    try {
      const entregado = await pedirCreacion(asesor.token);
      const idRechazado = identificacionAleatoria();
      receptor.escenarios.set(idRechazado, [
        { tipo: 'cuerpo', status: 400, texto: 'dato sensible del receptor' },
      ]);
      await crearCredito(asesor.token, { identificacionAsociado: idRechazado });
      await procesarHastaFinal([(entregado.body as { data: { id: string } }).data.id]);
      await drenar();

      const entrega = llamadas.find((l) => l.texto.includes('Webhook entregado'));
      expect(entrega?.requestId).toBe(entregado.get('X-Request-Id'));
      const fallido = llamadas.find((l) => l.texto.includes('Webhook FALLIDO'));
      expect(fallido?.nivel).toBe('error');
      expect(fallido?.texto).toContain('rechazo definitivo');
      expect(llamadas.some((l) => l.texto.includes('dato sensible del receptor'))).toBe(false);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
