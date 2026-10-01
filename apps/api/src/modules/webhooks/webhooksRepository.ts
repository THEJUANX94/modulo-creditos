import type {
  EstadoEventoWebhook,
  EventoWebhook,
  FiltrosEventosWebhook,
  IntentoWebhook,
  ResultadoIntentoWebhook,
} from '@creditos/shared';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../shared/db/prisma';

// Lecturas con el cliente tipado de Prisma. El INSERT del evento, el reclamo del worker y los
// cambios de estado van con SQL parametrizado: el INSERT respeta los DEFAULT de la tabla (Prisma
// lee N'PENDIENTE' como texto literal), el reclamo necesita hints de bloqueo y OUTPUT, y las fechas
// salen del reloj de la BD, el mismo con que se comparan (ADR 0003, ADR 0018).

const relaciones = {
  Creditos: { select: { numeroCredito: true } },
} satisfies Prisma.WebhookEventosInclude;

type FilaEvento = Prisma.WebhookEventosGetPayload<{ include: typeof relaciones }>;

function aEvento(fila: FilaEvento): EventoWebhook {
  return {
    eventId: fila.eventId.toLowerCase(),
    tipoEvento: fila.tipoEvento,
    creditoId: fila.creditoId.toLowerCase(),
    numeroCredito: fila.Creditos.numeroCredito,
    estado: fila.estado as EstadoEventoWebhook,
    intentos: fila.intentos,
    proximoIntento: fila.estado === 'PENDIENTE' ? fila.proximoIntento.toISOString() : null,
    requestId: fila.requestId,
    fechaCreacion: fila.fechaCreacion.toISOString(),
    fechaEntrega: fila.fechaEntrega?.toISOString() ?? null,
  };
}

// ───────────── API: outbox y traza ─────────────

// Se llama dentro de la transacción que crea el crédito: o se guardan los dos o ninguno (ADR 0006).
export async function registrarEvento(
  tx: Prisma.TransactionClient,
  datos: {
    eventId: string;
    tipoEvento: string;
    creditoId: string;
    payload: string;
    requestId: string | null;
  },
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO dbo.WebhookEventos (eventId, tipoEvento, creditoId, payload, requestId)
    VALUES (${datos.eventId}, ${datos.tipoEvento}, ${datos.creditoId}, ${datos.payload}, ${datos.requestId})`;
}

export async function listar(
  filtros: FiltrosEventosWebhook,
): Promise<{ eventos: EventoWebhook[]; total: number }> {
  const where: Prisma.WebhookEventosWhereInput = {
    ...(filtros.estado && { estado: filtros.estado }),
    ...(filtros.creditoId && { creditoId: filtros.creditoId }),
  };
  const [filas, total] = await prisma.$transaction([
    prisma.webhookEventos.findMany({
      where,
      include: relaciones,
      orderBy: { id: 'desc' },
      skip: (filtros.pagina - 1) * filtros.tamanoPagina,
      take: filtros.tamanoPagina,
    }),
    prisma.webhookEventos.count({ where }),
  ]);
  return { eventos: filas.map(aEvento), total };
}

export async function obtener(
  eventId: string,
): Promise<{ evento: EventoWebhook; payload: string; traza: IntentoWebhook[] } | null> {
  const fila = await prisma.webhookEventos.findUnique({
    where: { eventId },
    include: { ...relaciones, WebhookIntentos: { orderBy: { numeroIntento: 'desc' } } },
  });
  if (!fila) return null;
  return {
    evento: aEvento(fila),
    payload: fila.payload,
    traza: fila.WebhookIntentos.map((intento) => ({
      numeroIntento: intento.numeroIntento,
      resultado: intento.resultado as ResultadoIntentoWebhook,
      statusHttp: intento.statusHttp,
      duracionMs: intento.duracionMs,
      error: intento.error,
      fecha: intento.fecha.toISOString(),
    })),
  };
}

// ───────────── Worker: reclamo y resultado ─────────────

export interface EventoReclamado {
  id: bigint;
  eventId: string;
  payload: string;
  requestId: string | null;
  // Ya incluye el intento que se va a hacer: es su numeroIntento en la traza.
  intentos: number;
}

// Toma hasta `lote` eventos pendientes y vencidos en una sola sentencia atómica. UPDLOCK + READPAST:
// otra réplica salta las filas tomadas en vez de esperarlas, así que nunca dos envían el mismo.
// El lease corre proximoIntento al futuro: si el worker muere a mitad, el evento reaparece al vencer.
//
// UPDLOCK retiene el bloqueo de cada fila que lee hasta el final de la sentencia: si el plan leyera
// todos los pendientes (para ordenarlos o buscar columnas fuera del índice), los bloquearía todos y
// la otra réplica no tomaría ninguno. Por eso el TOP va en una subconsulta que solo lee el índice
// filtrado (ya ordenado y con el id): cada reclamo bloquea exactamente las filas que toma.
export async function reclamar(lote: number, leaseSegundos: number): Promise<EventoReclamado[]> {
  const filas = await prisma.$queryRaw<
    {
      id: bigint | number | string;
      eventId: string;
      payload: string;
      requestId: string | null;
      intentos: number;
    }[]
  >`
    UPDATE e
    SET intentos = e.intentos + 1,
        proximoIntento = DATEADD(SECOND, ${leaseSegundos}, SYSUTCDATETIME())
    OUTPUT INSERTED.id, INSERTED.eventId, INSERTED.payload, INSERTED.requestId, INSERTED.intentos
    FROM dbo.WebhookEventos AS e
    WHERE e.id IN (
      SELECT TOP (${lote}) id
      FROM dbo.WebhookEventos WITH (UPDLOCK, READPAST, ROWLOCK, INDEX(IX_WebhookEventos_pendientes))
      WHERE estado = N'PENDIENTE' AND proximoIntento <= SYSUTCDATETIME()
      ORDER BY proximoIntento
    )`;
  return filas.map((fila) => ({
    ...fila,
    id: BigInt(fila.id),
    eventId: fila.eventId.toLowerCase(),
  }));
}

export type Desenlace =
  { estado: 'ENTREGADO' } | { estado: 'PENDIENTE'; esperaMs: number } | { estado: 'FALLIDO' };

// Solo cambia el evento si sigue siendo de este reclamo (mismo número de intento): si el lease
// venció y otro worker lo tomó, el intento queda en la traza pero no pisa el estado del otro.
function actualizarEvento(eventoId: bigint, numeroIntento: number, desenlace: Desenlace) {
  const deEsteReclamo = Prisma.sql`id = ${eventoId} AND intentos = ${numeroIntento} AND estado = N'PENDIENTE'`;
  switch (desenlace.estado) {
    case 'ENTREGADO':
      return prisma.$executeRaw`
        UPDATE dbo.WebhookEventos SET estado = N'ENTREGADO', fechaEntrega = SYSUTCDATETIME()
        WHERE ${deEsteReclamo}`;
    case 'PENDIENTE':
      return prisma.$executeRaw`
        UPDATE dbo.WebhookEventos
        SET proximoIntento = DATEADD(MILLISECOND, ${desenlace.esperaMs}, SYSUTCDATETIME())
        WHERE ${deEsteReclamo}`;
    case 'FALLIDO':
      return prisma.$executeRaw`
        UPDATE dbo.WebhookEventos SET estado = N'FALLIDO' WHERE ${deEsteReclamo}`;
  }
}

// La traza del intento y el nuevo estado del evento, en una transacción. Devuelve false si el
// evento ya no era de este reclamo.
export async function registrarIntento(
  eventoId: bigint,
  numeroIntento: number,
  intento: {
    resultado: ResultadoIntentoWebhook;
    statusHttp: number | null;
    duracionMs: number;
    error: string | null;
  },
  desenlace: Desenlace,
): Promise<boolean> {
  const [, filasActualizadas] = await prisma.$transaction([
    prisma.webhookIntentos.create({ data: { eventoId, numeroIntento, ...intento } }),
    actualizarEvento(eventoId, numeroIntento, desenlace),
  ]);
  return filasActualizadas === 1;
}
