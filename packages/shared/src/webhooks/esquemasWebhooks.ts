import { z } from 'zod';
import { esquemaPaginacion } from '../http/paginacion';
import { estadosEventoWebhook } from './estadosWebhook';

// Filtros de la traza del webhook (solo ADMIN). Por crédito, la usa el detalle del crédito.
export const esquemaFiltrosEventosWebhook = esquemaPaginacion.extend({
  estado: z.enum(estadosEventoWebhook).optional(),
  creditoId: z.uuid({ error: 'creditoId debe ser un UUID' }).optional(),
});

export type FiltrosEventosWebhook = z.infer<typeof esquemaFiltrosEventosWebhook>;
