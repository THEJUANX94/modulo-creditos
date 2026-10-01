import type { MetaPaginacion, RespuestaExito } from '@creditos/shared';
import type { Response } from 'express';

interface OpcionesRespuesta {
  status?: number;
  meta?: MetaPaginacion;
}

export function responderExito<T>(res: Response, data: T, opciones: OpcionesRespuesta = {}): void {
  const cuerpo: RespuestaExito<T> = {
    success: true,
    data,
    ...(opciones.meta && { meta: opciones.meta }),
  };
  res.status(opciones.status ?? 200).json(cuerpo);
}
