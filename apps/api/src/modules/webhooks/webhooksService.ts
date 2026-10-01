import { randomUUID } from 'node:crypto';
import {
  esquemaEventoCreditoCreado,
  tipoEventoCreditoCreado,
  type Credito,
  type DetalleEventoWebhook,
  type EventoCreditoCreado,
  type EventoWebhook,
  type FiltrosEventosWebhook,
  type MetaPaginacion,
} from '@creditos/shared';
import type { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../shared/errores/appError';
import * as webhooksRepository from './webhooksRepository';

// Lado de la API del webhook (ADR 0018): registrar el evento al crear el crédito y consultar la
// traza. El envío lo hace el worker (despachadorWebhooks.ts), que corre en otro proceso.

// Parte del caso de uso de creación: corre dentro de su transacción, con el crédito ya leído. No
// repite ninguna regla ni hace otro INSERT del crédito (ADR 0006). El payload se guarda tal cual
// se enviará: cada reintento manda los mismos bytes.
export async function registrarCreditoCreado(
  tx: Prisma.TransactionClient,
  credito: Credito,
  requestId: string | null,
): Promise<void> {
  const evento: EventoCreditoCreado = {
    event: tipoEventoCreditoCreado,
    eventId: randomUUID(),
    timestamp: credito.fechaSolicitud,
    data: {
      id: credito.id,
      numeroCredito: credito.numeroCredito,
      tipoIdentificacionAsociado: credito.tipoIdentificacionAsociado,
      identificacionAsociado: credito.identificacionAsociado,
      tipoCredito: credito.tipoCredito,
      valorSolicitado: credito.valorSolicitado,
      estado: 'SOLICITADO',
    },
  };
  await webhooksRepository.registrarEvento(tx, {
    eventId: evento.eventId,
    tipoEvento: evento.event,
    creditoId: credito.id,
    payload: JSON.stringify(evento),
    requestId,
  });
}

export async function listar(
  filtros: FiltrosEventosWebhook,
): Promise<{ eventos: EventoWebhook[]; meta: MetaPaginacion }> {
  const { eventos, total } = await webhooksRepository.listar(filtros);
  return {
    eventos,
    meta: {
      pagina: filtros.pagina,
      tamanoPagina: filtros.tamanoPagina,
      total,
      totalPaginas: Math.ceil(total / filtros.tamanoPagina),
    },
  };
}

export async function obtener(eventId: string): Promise<DetalleEventoWebhook> {
  const encontrado = await webhooksRepository.obtener(eventId);
  if (!encontrado) {
    throw new AppError('EVENTO_WEBHOOK_NOT_FOUND', 'El evento del webhook no existe');
  }
  return {
    ...encontrado.evento,
    payload: esquemaEventoCreditoCreado.parse(JSON.parse(encontrado.payload)),
    traza: encontrado.traza,
  };
}
