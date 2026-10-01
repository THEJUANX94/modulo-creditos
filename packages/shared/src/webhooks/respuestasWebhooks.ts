import { z } from 'zod';
import { estadosEventoWebhook, resultadosIntentoWebhook } from './estadosWebhook';
import { esquemaEventoCreditoCreado } from './eventoCreditoCreado';

// Respuestas de la traza del webhook. El tipo de TypeScript sale del esquema, como en créditos.

const esquemaFecha = z.iso.datetime().meta({ example: '2026-10-01T15:04:05.123Z' });

export const esquemaEventoWebhook = z
  .object({
    eventId: z.uuid(),
    tipoEvento: z.string().meta({ example: 'credito.creado' }),
    creditoId: z.uuid(),
    numeroCredito: z.string().meta({ example: 'CR-2026-000123' }),
    estado: z.enum(estadosEventoWebhook),
    intentos: z.number().int().meta({ description: 'Intentos de envío realizados' }),
    proximoIntento: esquemaFecha
      .nullable()
      .meta({ description: 'Solo en PENDIENTE: cuándo sale el próximo intento' }),
    requestId: z
      .string()
      .nullable()
      .meta({ description: 'La petición que creó el crédito; viaja al receptor en X-Request-Id' }),
    fechaCreacion: esquemaFecha,
    fechaEntrega: esquemaFecha.nullable(),
  })
  .meta({ id: 'EventoWebhook' });

export type EventoWebhook = z.infer<typeof esquemaEventoWebhook>;

export const esquemaIntentoWebhook = z
  .object({
    numeroIntento: z.number().int(),
    resultado: z.enum(resultadosIntentoWebhook),
    statusHttp: z.number().int().nullable().meta({ description: 'NULL si no hubo respuesta' }),
    duracionMs: z.number().int().nullable(),
    error: z.string().nullable().meta({
      description:
        'TIMEOUT y ERROR_RED: el error (p. ej. ECONNREFUSED). ERROR_HTTP: el inicio de la respuesta',
    }),
    fecha: esquemaFecha,
  })
  .meta({ id: 'IntentoWebhook' });

export type IntentoWebhook = z.infer<typeof esquemaIntentoWebhook>;

export const esquemaDetalleEventoWebhook = esquemaEventoWebhook
  .extend({
    payload: esquemaEventoCreditoCreado,
    traza: z
      .array(esquemaIntentoWebhook)
      .meta({ description: 'Cada intento de envío, lo más reciente primero' }),
  })
  .meta({ id: 'DetalleEventoWebhook' });

export type DetalleEventoWebhook = z.infer<typeof esquemaDetalleEventoWebhook>;
