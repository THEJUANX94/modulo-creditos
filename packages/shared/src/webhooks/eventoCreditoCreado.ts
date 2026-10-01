import { z } from 'zod';

// Contrato del evento que recibe el sistema externo (ADR 0018). La API lo arma al crear el
// crédito, el mock lo valida y Swagger lo documenta: los tres usan esta definición.
// `event`, `eventId`, `timestamp` y `data` van como en el enunciado.

export const tipoEventoCreditoCreado = 'credito.creado';

export const esquemaEventoCreditoCreado = z
  .object({
    event: z.literal(tipoEventoCreditoCreado),
    eventId: z.uuid().meta({
      description:
        'Igual al header webhook-id, también en los reintentos: el receptor deduplica con él',
    }),
    timestamp: z.iso.datetime().meta({
      description:
        'Momento de la creación del crédito (UTC), no el del envío: cada reintento manda el mismo cuerpo',
      example: '2026-10-01T18:00:00.000Z',
    }),
    data: z.object({
      id: z.uuid(),
      numeroCredito: z.string().meta({ example: 'CR-2026-000123' }),
      tipoIdentificacionAsociado: z.string().meta({ example: 'CC' }),
      identificacionAsociado: z.string().meta({ example: '1001234567' }),
      tipoCredito: z.string().meta({ example: 'LIBRE_INVERSION' }),
      valorSolicitado: z
        .string()
        .meta({ description: 'Exacto, 2 decimales, como en la API', example: '15000000.00' }),
      estado: z.literal('SOLICITADO'),
    }),
  })
  .meta({ id: 'EventoCreditoCreado' });

export type EventoCreditoCreado = z.infer<typeof esquemaEventoCreditoCreado>;
