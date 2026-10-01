import type { ResultadoIntentoWebhook } from '@creditos/shared';
import { configWorker } from '../../config/configWorker';
import { contextoPeticion } from '../../shared/contextoPeticion';
import { logger } from '../../shared/logger';
import { firmarWebhook } from './firmaWebhook';
import { esperaTrasIntento, esStatusReintentable } from './politicaReintentos';
import * as webhooksRepository from './webhooksRepository';
import type { Desenlace, EventoReclamado } from './webhooksRepository';

// Envío de los eventos del outbox (ADR 0018). Solo lo usa el worker: importa configWorker, que
// exige el secreto de la firma, y la API nunca lo carga.

export const tamanoLote = 10;
// Mayor que el timeout máximo (30 s): un envío en curso nunca pierde su lease.
const leaseSegundos = 60;
const bytesMaximosRespuesta = 2048;
const caracteresMaximosError = 500;
const agenteUsuario = 'ModuloCreditos-Webhook/0.1';

interface ResultadoEnvio {
  resultado: ResultadoIntentoWebhook;
  statusHttp: number | null;
  duracionMs: number;
  error: string | null;
  reintentable: boolean;
}

// Una vuelta del worker: toma un lote y lo envía en paralelo, cada evento con su propio timeout.
// Devuelve cuántos tomó: si el lote salió lleno, el worker vuelve a leer sin esperar.
export async function procesarLote(): Promise<number> {
  const eventos = await webhooksRepository.reclamar(tamanoLote, leaseSegundos);
  await Promise.all(
    eventos.map((evento) =>
      // Los logs del envío llevan el requestId de la petición que creó el crédito (ADR 0010).
      contextoPeticion.run({ requestId: evento.requestId ?? evento.eventId }, () =>
        procesarEvento(evento),
      ),
    ),
  );
  return eventos.length;
}

async function procesarEvento(evento: EventoReclamado): Promise<void> {
  const numeroIntento = evento.intentos;
  const envio = await enviar(evento);
  const desenlace = decidir(envio, numeroIntento);

  try {
    const vigente = await webhooksRepository.registrarIntento(
      evento.id,
      numeroIntento,
      {
        resultado: envio.resultado,
        statusHttp: envio.statusHttp,
        duracionMs: envio.duracionMs,
        error: envio.error,
      },
      desenlace,
    );
    registrarLog(evento.eventId, numeroIntento, envio, desenlace, vigente);
  } catch (error) {
    logger.error(
      { err: error, eventId: evento.eventId, numeroIntento },
      'No se pudo registrar el intento: el evento vuelve a salir al vencer el lease',
    );
  }
}

function decidir(envio: ResultadoEnvio, numeroIntento: number): Desenlace {
  if (envio.resultado === 'EXITOSO') return { estado: 'ENTREGADO' };
  if (!envio.reintentable || numeroIntento >= configWorker.maxIntentos)
    return { estado: 'FALLIDO' };
  return {
    estado: 'PENDIENTE',
    esperaMs: esperaTrasIntento(numeroIntento, configWorker.backoffBaseMs),
  };
}

async function enviar(evento: EventoReclamado): Promise<ResultadoEnvio> {
  const inicio = performance.now();
  const duracionMs = () => Math.round(performance.now() - inicio);
  const timestamp = Math.floor(Date.now() / 1000);

  try {
    const respuesta = await fetch(configWorker.webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': agenteUsuario,
        'webhook-id': evento.eventId,
        'webhook-timestamp': String(timestamp),
        'webhook-signature': firmarWebhook(
          configWorker.webhookSecreto,
          evento.eventId,
          timestamp,
          evento.payload,
        ),
        ...(evento.requestId && { 'x-request-id': evento.requestId }),
      },
      // El snapshot exacto del outbox: el mismo cuerpo en cada intento.
      body: evento.payload,
      // Seguir una redirección mandaría el payload firmado a otro host: un 3xx es un rechazo.
      redirect: 'manual',
      signal: AbortSignal.timeout(configWorker.timeoutMs),
    });

    if (respuesta.ok) {
      await respuesta.body?.cancel().catch(() => undefined);
      return {
        resultado: 'EXITOSO',
        statusHttp: respuesta.status,
        duracionMs: duracionMs(),
        error: null,
        reintentable: false,
      };
    }
    return {
      resultado: 'ERROR_HTTP',
      statusHttp: respuesta.status,
      error: await leerInicio(respuesta),
      duracionMs: duracionMs(),
      reintentable: esStatusReintentable(respuesta.status),
    };
  } catch (error) {
    if (esTimeout(error)) {
      return {
        resultado: 'TIMEOUT',
        statusHttp: null,
        duracionMs: duracionMs(),
        error: `Sin respuesta en ${configWorker.timeoutMs} ms`,
        reintentable: true,
      };
    }
    return {
      resultado: 'ERROR_RED',
      statusHttp: null,
      duracionMs: duracionMs(),
      error: describirError(error),
      reintentable: true,
    };
  }
}

// El inicio del cuerpo de un rechazo, que suele decir el motivo. Se lee con tope: un receptor no
// puede hacer que el worker cargue una respuesta enorme.
async function leerInicio(respuesta: Response): Promise<string | null> {
  if (!respuesta.body) return null;
  const lector: ReadableStreamDefaultReader<Uint8Array> = respuesta.body.getReader();
  const partes: Uint8Array[] = [];
  let leidos = 0;
  try {
    while (leidos < bytesMaximosRespuesta) {
      const { done, value } = await lector.read();
      if (done) break;
      partes.push(value);
      leidos += value.byteLength;
    }
  } catch {
    // Cuerpo cortado o vencido el timeout a mitad: se guarda lo que se alcanzó a leer.
  } finally {
    void lector.cancel().catch(() => undefined);
  }
  const texto = new TextDecoder().decode(Buffer.concat(partes)).trim();
  return texto ? texto.slice(0, caracteresMaximosError) : null;
}

function esTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

// fetch envuelve el error de red en `cause`: ahí está el código útil (ECONNREFUSED, ENOTFOUND…).
function describirError(error: unknown): string {
  const causa = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  if (!(causa instanceof Error)) return String(causa).slice(0, 1000);
  const codigo = (causa as NodeJS.ErrnoException).code;
  const mensaje =
    causa.message ||
    (causa instanceof AggregateError
      ? causa.errors
          .map((detalle: unknown) => (detalle instanceof Error ? detalle.message : String(detalle)))
          .join('; ')
      : '');
  return (codigo ? `${codigo}: ${mensaje}` : mensaje).slice(0, 1000);
}

// El cuerpo de un rechazo no va al log: podría repetir datos del payload. Queda en la traza (BD).
function registrarLog(
  eventId: string,
  numeroIntento: number,
  envio: ResultadoEnvio,
  desenlace: Desenlace,
  vigente: boolean,
): void {
  const datos = {
    eventId,
    numeroIntento,
    resultado: envio.resultado,
    statusHttp: envio.statusHttp,
    duracionMs: envio.duracionMs,
    ...(envio.resultado !== 'ERROR_HTTP' && envio.error && { error: envio.error }),
  };
  if (!vigente) {
    logger.warn(datos, 'Intento registrado, pero otro worker ya había retomado el evento');
  } else if (desenlace.estado === 'ENTREGADO') {
    logger.info(datos, 'Webhook entregado');
  } else if (desenlace.estado === 'PENDIENTE') {
    logger.warn({ ...datos, esperaMs: desenlace.esperaMs }, 'Webhook no entregado: se reintentará');
  } else {
    logger.error(
      { ...datos, motivo: envio.reintentable ? 'intentos agotados' : 'rechazo definitivo' },
      'Webhook FALLIDO',
    );
  }
}
