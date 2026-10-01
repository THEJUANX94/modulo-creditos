import type { CodigoError } from '../errores/codigosError';

// Sobre de las respuestas de la API: { success, data, meta } en éxito y
// { success, error, requestId } en error (el formato de error lo fija el enunciado).

export interface MetaPaginacion {
  pagina: number;
  tamanoPagina: number;
  total: number;
  totalPaginas: number;
}

export interface RespuestaExito<T> {
  success: true;
  data: T;
  meta?: MetaPaginacion;
}

export interface DetalleError {
  campo: string;
  mensaje: string;
}

export interface RespuestaError {
  success: false;
  error: {
    code: CodigoError;
    message: string;
    details?: DetalleError[];
  };
  requestId: string;
}
