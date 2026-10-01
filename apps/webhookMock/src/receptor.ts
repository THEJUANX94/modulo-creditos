import { esquemaEventoCreditoCreado } from '@creditos/shared';
import { Webhook, WebhookVerificationError } from 'standardwebhooks';
import { config, type Modo } from './config';

// Lo que haría un sistema externo bien hecho con nuestro webhook (ADR 0020): verifica la firma con
// la librería oficial de Standard Webhooks (incluida la ventana de 5 minutos), valida el contrato,
// deduplica por webhook-id y responde según el modo configurado. Todo vive en memoria.

export type Resultado =
  'aceptado' | 'duplicado' | 'falla' | 'rechazo' | 'firma inválida' | 'payload inválido';

export interface Recepcion {
  numero: number;
  fecha: string;
  webhookId: string | null;
  requestId: string | null;
  numeroCredito: string | null;
  valorSolicitado: string | null;
  // Cuántas veces llegó este evento (1 = primer envío).
  envio: number;
  modo: Modo;
  resultado: Resultado;
  status: number;
  detalle: string | null;
}

export interface Respuesta {
  status: number;
  cuerpo: Record<string, unknown>;
  // Solo en el modo lento: cuánto esperar antes de responder.
  retrasoMs?: number;
}

const maximoRecepciones = 200;
const verificador = new Webhook(config.secreto);

export const estado = {
  modo: config.modoInicial,
  fallasPorEvento: config.fallasPorEventoInicial,
  recepciones: [] as Recepcion[],
  // webhook-id que ya se procesaron (respondidos con 2xx): el siguiente envío es un duplicado.
  procesados: new Set<string>(),
  enviosPorEvento: new Map<string, number>(),
  total: 0,
};

const encabezado = (encabezados: Record<string, string | string[] | undefined>, nombre: string) => {
  const valor = encabezados[nombre];
  return Array.isArray(valor) ? (valor[0] ?? null) : (valor ?? null);
};

export function recibir(
  cuerpo: string,
  encabezados: Record<string, string | string[] | undefined>,
): Respuesta {
  const webhookId = encabezado(encabezados, 'webhook-id');
  const base = {
    webhookId,
    requestId: encabezado(encabezados, 'x-request-id'),
    numeroCredito: null,
    valorSolicitado: null,
    envio: 1,
    modo: estado.modo,
  };

  // 1. Firma y ventana de tiempo.
  let datos: unknown;
  try {
    datos = verificador.verify(cuerpo, {
      'webhook-id': webhookId ?? '',
      'webhook-timestamp': encabezado(encabezados, 'webhook-timestamp') ?? '',
      'webhook-signature': encabezado(encabezados, 'webhook-signature') ?? '',
    });
  } catch (error) {
    const motivo = error instanceof WebhookVerificationError ? error.message : 'Firma ilegible';
    return registrar({ ...base, resultado: 'firma inválida', status: 401, detalle: motivo });
  }

  // 2. Contrato del evento, con el mismo esquema que lo arma la API.
  const evento = esquemaEventoCreditoCreado.safeParse(datos);
  if (!evento.success || evento.data.eventId !== webhookId) {
    const motivo = evento.success ? 'webhook-id distinto de eventId' : 'No cumple el contrato';
    return registrar({ ...base, resultado: 'payload inválido', status: 400, detalle: motivo });
  }

  const recibido = {
    ...base,
    numeroCredito: evento.data.data.numeroCredito,
    valorSolicitado: evento.data.data.valorSolicitado,
  };
  const id = evento.data.eventId;
  const envio = (estado.enviosPorEvento.get(id) ?? 0) + 1;
  estado.enviosPorEvento.set(id, envio);

  // 3. Idempotencia: lo ya procesado se confirma sin procesarlo otra vez.
  if (estado.procesados.has(id)) {
    return registrar({ ...recibido, envio, resultado: 'duplicado', status: 200, detalle: null });
  }

  // 4. El modo decide la respuesta.
  const falla = () =>
    registrar({ ...recibido, envio, resultado: 'falla', status: 503, detalle: null });
  const acepta = (retrasoMs?: number) => {
    // Se procesa aunque el worker ya no espere la respuesta (modo lento): por eso su reintento
    // llega como duplicado. Es la entrega al menos una vez.
    estado.procesados.add(id);
    return {
      ...registrar({ ...recibido, envio, resultado: 'aceptado', status: 200, detalle: null }),
      ...(retrasoMs && { retrasoMs }),
    };
  };

  switch (estado.modo) {
    case 'acepta':
      return acepta();
    case 'falla':
      return falla();
    case 'rechaza':
      return registrar({
        ...recibido,
        envio,
        resultado: 'rechazo',
        status: 400,
        detalle: 'Rechazado por el sistema externo (modo rechaza)',
      });
    case 'lento':
      return acepta(config.retrasoMs);
    case 'intermitente':
      return Math.random() < 0.5 ? falla() : acepta();
    case 'fallaPrimeros':
      return envio <= estado.fallasPorEvento ? falla() : acepta();
  }
}

function registrar(datos: Omit<Recepcion, 'numero' | 'fecha'>): Respuesta {
  estado.total++;
  const recepcion: Recepcion = { numero: estado.total, fecha: new Date().toISOString(), ...datos };
  estado.recepciones.unshift(recepcion);
  estado.recepciones.length = Math.min(estado.recepciones.length, maximoRecepciones);
  console.log(
    `[mock] ${recepcion.status} ${recepcion.resultado} webhook-id=${recepcion.webhookId ?? '-'} envío=${recepcion.envio} modo=${recepcion.modo}`,
  );
  return {
    status: recepcion.status,
    cuerpo: {
      resultado: recepcion.resultado,
      ...(recepcion.detalle && { detalle: recepcion.detalle }),
    },
  };
}
