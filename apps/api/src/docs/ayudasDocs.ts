import {
  codigosError,
  esquemaMetaPaginacion,
  esquemaRespuestaError,
  type CodigoError,
} from '@creditos/shared';
import { z } from 'zod';

// Piezas comunes para que cada módulo documente sus rutas con el mismo formato (ADR 0017).

export const seguridadBearer = [{ bearerAuth: [] }];

export function sobreExito<T extends z.ZodType>(data: T) {
  return z.object({ success: z.literal(true), data });
}

export function sobreLista<T extends z.ZodType>(item: T) {
  return z.object({ success: z.literal(true), data: z.array(item), meta: esquemaMetaPaginacion });
}

export function cuerpoJson<T extends z.ZodType>(esquema: T) {
  return { content: { 'application/json': { schema: esquema } } };
}

export function respuestaJson<T extends z.ZodType>(descripcion: string, esquema: T) {
  return { description: descripcion, ...cuerpoJson(esquema) };
}

// Agrupa los códigos de error por status: { 409: "CREDITO_DUPLICADO · CREDITO_MODIFICADO" }.
export function errores(...codigos: CodigoError[]) {
  const porStatus = new Map<number, CodigoError[]>();
  for (const codigo of codigos) {
    const status = codigosError[codigo].status;
    porStatus.set(status, [...(porStatus.get(status) ?? []), codigo]);
  }
  return Object.fromEntries(
    [...porStatus].map(([status, lista]) => [
      status,
      respuestaJson(lista.join(' · '), esquemaRespuestaError),
    ]),
  );
}

// Errores que puede devolver cualquier ruta autenticada.
export const erroresAutenticacion: CodigoError[] = [
  'NO_AUTENTICADO',
  'SESION_INVALIDA',
  'CAMBIO_CONTRASENA_REQUERIDO',
  'DEMASIADAS_SOLICITUDES',
];
