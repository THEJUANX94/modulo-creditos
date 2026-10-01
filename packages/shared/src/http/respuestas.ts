import { z } from 'zod';
import { codigosError } from '../errores/codigosError';

// Sobre de las respuestas de la API: { success, data, meta } en éxito y
// { success, error, requestId } en error (el formato de error lo fija el enunciado).

export const esquemaMetaPaginacion = z
  .object({
    pagina: z.number().int(),
    tamanoPagina: z.number().int(),
    total: z.number().int(),
    totalPaginas: z.number().int(),
  })
  .meta({ id: 'MetaPaginacion' });

export type MetaPaginacion = z.infer<typeof esquemaMetaPaginacion>;

export interface RespuestaExito<T> {
  success: true;
  data: T;
  meta?: MetaPaginacion;
}

export const esquemaDetalleError = z.object({
  campo: z.string().meta({ example: 'valorSolicitado' }),
  mensaje: z.string().meta({ example: 'El valor solicitado debe ser mayor que 0' }),
});

export type DetalleError = z.infer<typeof esquemaDetalleError>;

const codigos = Object.keys(codigosError) as [
  keyof typeof codigosError,
  ...(keyof typeof codigosError)[],
];

export const esquemaRespuestaError = z
  .object({
    success: z.literal(false),
    error: z.object({
      code: z.enum(codigos),
      message: z.string(),
      details: z.array(esquemaDetalleError).optional(),
    }),
    requestId: z.string(),
  })
  .meta({ id: 'RespuestaError' });

export type RespuestaError = z.infer<typeof esquemaRespuestaError>;
