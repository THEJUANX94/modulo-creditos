import { z } from 'zod';
import { estadosCredito } from './estadosCredito';

// Respuestas de créditos. El tipo de TypeScript sale del esquema: lo que documenta Swagger es lo
// que devuelve la API.

const esquemaFecha = z.iso.datetime().meta({ example: '2026-10-01T15:04:05.123Z' });

export const esquemaCredito = z
  .object({
    id: z.uuid(),
    numeroCredito: z.string().meta({ example: 'CR-2026-000123' }),
    tipoIdentificacionAsociado: z.string().meta({ example: 'CC' }),
    identificacionAsociado: z.string().meta({ example: '1001234567' }),
    nombreAsociado: z.string().meta({ example: 'Juan Pérez' }),
    tipoCredito: z.string().meta({ example: 'LIBRE_INVERSION' }),
    valorSolicitado: z
      .string()
      .meta({ description: 'Exacto, 2 decimales', example: '15000000.00' }),
    tasaInteres: z.string().meta({ description: '% mensual, 4 decimales', example: '1.5000' }),
    numeroCuotas: z.number().int().meta({ example: 36 }),
    formaPago: z.string().meta({ example: 'NOMINA' }),
    estado: z.enum(estadosCredito),
    fechaSolicitud: esquemaFecha,
    fechaActualizacion: esquemaFecha,
    version: z.string().meta({ example: '0x00000000000007E1' }),
    eliminacion: z
      .object({
        fecha: esquemaFecha,
        usuarioNombre: z.string(),
        motivo: z.string().nullable(),
      })
      .optional()
      .meta({ description: 'Solo en créditos eliminados, visibles únicamente para ADMIN' }),
  })
  .meta({ id: 'Credito' });

export type Credito = z.infer<typeof esquemaCredito>;

const esquemaUsuarioHistorial = z.object({ id: z.uuid(), nombre: z.string() });

export const esquemaEntradaHistorial = z
  .discriminatedUnion('tipo', [
    z.object({
      tipo: z.literal('ESTADO'),
      fecha: esquemaFecha,
      usuario: esquemaUsuarioHistorial,
      estadoAnterior: z.enum(estadosCredito).nullable(),
      estadoNuevo: z.enum(estadosCredito),
      observacion: z.string().nullable(),
    }),
    z.object({
      tipo: z.literal('EDICION'),
      fecha: esquemaFecha,
      usuario: esquemaUsuarioHistorial,
      operacionId: z.uuid(),
      motivo: z.string().nullable(),
      cambios: z.array(
        z.object({
          campo: z.string(),
          valorAnterior: z.string().nullable(),
          valorNuevo: z.string().nullable(),
        }),
      ),
    }),
    z.object({
      tipo: z.literal('ELIMINACION'),
      fecha: esquemaFecha,
      usuario: esquemaUsuarioHistorial,
      motivo: z.string().nullable(),
    }),
  ])
  .meta({ id: 'EntradaHistorial' });

export type EntradaHistorial = z.infer<typeof esquemaEntradaHistorial>;

const esquemaTotales = z.object({
  cantidad: z.number().int(),
  monto: z
    .string()
    .meta({ description: 'Suma de valorSolicitado, exacta', example: '45000000.00' }),
});

export const esquemaResumenCreditos = z
  .object({
    total: z.number().int(),
    montoTotal: z.string().meta({ example: '120000000.00' }),
    porEstado: z.record(z.enum(estadosCredito), esquemaTotales),
  })
  .meta({ id: 'ResumenCreditos' });

export type ResumenCreditos = z.infer<typeof esquemaResumenCreditos>;

const esquemaItemCatalogo = z.object({ codigo: z.string(), nombre: z.string() });

export const esquemaCatalogos = z
  .object({
    tiposCredito: z.array(esquemaItemCatalogo),
    formasPago: z.array(esquemaItemCatalogo),
    tiposIdentificacion: z.array(esquemaItemCatalogo),
    estados: z.array(z.enum(estadosCredito)),
  })
  .meta({ id: 'Catalogos' });

export type ItemCatalogo = z.infer<typeof esquemaItemCatalogo>;
export type Catalogos = z.infer<typeof esquemaCatalogos>;
