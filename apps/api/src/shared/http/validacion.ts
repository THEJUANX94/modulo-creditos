import type { DetalleError } from '@creditos/shared';
import type { z } from 'zod';
import { AppError } from '../errores/appError';

// Valida la entrada con un esquema Zod compartido y devuelve los datos ya tipados y transformados.
// Si falla: 400 VALIDACION_FALLIDA con un detalle por campo, que el formulario muestra junto al input.
export function validarEntrada<T extends z.ZodType>(esquema: T, datos: unknown): z.output<T> {
  const resultado = esquema.safeParse(datos);
  if (resultado.success) return resultado.data;

  const details: DetalleError[] = resultado.error.issues.map((problema) => ({
    campo: problema.path.join('.') || '(cuerpo)',
    mensaje: problema.message,
  }));
  throw new AppError('VALIDACION_FALLIDA', 'Hay campos con errores', details);
}
