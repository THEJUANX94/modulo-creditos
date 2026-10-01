import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { config, esquemaFallasPorEvento, modos } from './config';
import { pagina } from './pagina';
import { estado, recibir } from './receptor';

// Mock del sistema externo que recibe el webhook (ADR 0006, ADR 0020). Simula lo que hay detrás de
// https://sistema-externo.com/webhooks/creditos, con node:http y sin framework.

const limiteCuerpo = 100 * 1024;

const esquemaControl = z
  .object({ modo: z.enum(modos).optional(), fallasPorEvento: esquemaFallasPorEvento.optional() })
  .refine((datos) => datos.modo !== undefined || datos.fallasPorEvento !== undefined, {
    error: 'Envíe modo o fallasPorEvento',
  });

class CuerpoDemasiadoGrande extends Error {}

function leerCuerpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolver, rechazar) => {
    let cuerpo = '';
    let excedido = false;
    req.setEncoding('utf8');
    req.on('data', (parte: string) => {
      if (excedido) return;
      cuerpo += parte;
      // Se deja de acumular, pero se termina de leer: así el cliente alcanza a recibir el 413.
      if (cuerpo.length > limiteCuerpo) {
        excedido = true;
        cuerpo = '';
        rechazar(new CuerpoDemasiadoGrande());
      }
    });
    req.on('end', () => resolver(cuerpo));
    req.on('error', rechazar);
  });
}

function json(res: ServerResponse, status: number, cuerpo: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(cuerpo));
}

function resumen() {
  const contar = (resultado: string) =>
    estado.recepciones.filter((recepcion) => recepcion.resultado === resultado).length;
  return {
    modo: estado.modo,
    fallasPorEvento: estado.fallasPorEvento,
    modos,
    totales: {
      peticiones: estado.total,
      'eventos procesados': estado.procesados.size,
      duplicados: contar('duplicado'),
      fallas: contar('falla'),
      rechazos: contar('rechazo'),
      'firma inválida': contar('firma inválida'),
    },
    recepciones: estado.recepciones,
  };
}

async function atender(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ruta = new URL(req.url ?? '/', 'http://mock').pathname;

  if (req.method === 'POST' && ruta === '/webhooks/creditos') {
    const respuesta = recibir(await leerCuerpo(req), req.headers);
    if (respuesta.retrasoMs) {
      setTimeout(() => {
        if (!res.destroyed) json(res, respuesta.status, respuesta.cuerpo);
      }, respuesta.retrasoMs);
      return;
    }
    json(res, respuesta.status, respuesta.cuerpo);
    return;
  }

  if (req.method === 'PUT' && ruta === '/control') {
    let cambios: unknown;
    try {
      cambios = JSON.parse(await leerCuerpo(req));
    } catch {
      json(res, 400, { error: 'JSON inválido' });
      return;
    }
    const validacion = esquemaControl.safeParse(cambios);
    if (!validacion.success) {
      json(res, 400, { error: z.prettifyError(validacion.error) });
      return;
    }
    estado.modo = validacion.data.modo ?? estado.modo;
    estado.fallasPorEvento = validacion.data.fallasPorEvento ?? estado.fallasPorEvento;
    console.log(`[mock] modo=${estado.modo} fallasPorEvento=${estado.fallasPorEvento}`);
    json(res, 200, { modo: estado.modo, fallasPorEvento: estado.fallasPorEvento });
    return;
  }

  if (req.method === 'GET' && ruta === '/recibidos') {
    json(res, 200, resumen());
    return;
  }

  if (req.method === 'GET' && ruta === '/salud') {
    json(res, 200, { estado: 'ok' });
    return;
  }

  if (req.method === 'GET' && ruta === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(pagina);
    return;
  }

  json(res, 404, { error: 'Ruta no encontrada' });
}

const servidor = createServer((req, res) => {
  atender(req, res).catch((error: unknown) => {
    if (error instanceof CuerpoDemasiadoGrande)
      return json(res, 413, { error: 'Cuerpo demasiado grande' });
    console.error('[mock] Error inesperado', error);
    if (!res.headersSent) json(res, 500, { error: 'Error interno del mock' });
  });
});

servidor.listen(config.puerto, () => {
  console.log(
    `[mock] Escuchando en http://localhost:${config.puerto} · POST /webhooks/creditos · modo=${estado.modo}`,
  );
});

// Apagado ordenado: deja de aceptar conexiones y sale.
for (const senal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(senal, () => {
    servidor.close(() => process.exit(0));
    servidor.closeAllConnections();
  });
}
