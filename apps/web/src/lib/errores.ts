import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { ErrorApi } from './api';

// Errores de la API en la interfaz (regla error-clarity): el mensaje de la API ya dice la causa en
// español; se le agrega el requestId para que soporte encuentre el caso en los logs (ADR 0010).

export function describirError(error: unknown): { titulo: string; detalle?: string } {
  if (error instanceof ErrorApi) {
    return {
      titulo: error.message,
      ...(error.requestId && { detalle: `Código de soporte: ${error.requestId}` }),
    };
  }
  return { titulo: 'Ocurrió un error inesperado. Intente de nuevo.' };
}

export function avisarError(error: unknown): void {
  const { titulo, detalle } = describirError(error);
  toast.error(titulo, { description: detalle });
}

// Un 400 de la API trae un detalle por campo: se muestran debajo de cada campo del formulario,
// como los errores de la validación local. Devuelve true si pudo asignar alguno.
export function aplicarErroresDeCampos<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  campos: readonly string[],
): boolean {
  if (!(error instanceof ErrorApi) || error.codigo !== 'VALIDACION_FALLIDA') return false;
  let asignados = 0;
  for (const detalle of error.detalles) {
    if (campos.includes(detalle.campo)) {
      setError(detalle.campo as Path<T>, { type: 'servidor', message: detalle.mensaje });
      asignados++;
    }
  }
  return asignados > 0;
}
