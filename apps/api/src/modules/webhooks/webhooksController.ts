import { esquemaFiltrosEventosWebhook } from '@creditos/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { responderExito } from '../../shared/http/respuestas';
import { validarEntrada } from '../../shared/http/validacion';
import * as webhooksService from './webhooksService';

export const esquemaEventIdWebhook = z.object({
  eventId: z.uuid({ error: 'El eventId debe ser un UUID' }),
});

export async function listar(req: Request, res: Response): Promise<void> {
  const filtros = validarEntrada(esquemaFiltrosEventosWebhook, req.query);
  const { eventos, meta } = await webhooksService.listar(filtros);
  responderExito(res, eventos, { meta });
}

export async function obtener(req: Request, res: Response): Promise<void> {
  const { eventId } = validarEntrada(esquemaEventIdWebhook, req.params);
  responderExito(res, await webhooksService.obtener(eventId.toLowerCase()));
}
