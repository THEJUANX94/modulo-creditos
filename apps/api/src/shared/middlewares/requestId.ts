import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { contextoPeticion } from '../contextoPeticion';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
  }
}

// Solo se acepta un X-Request-Id entrante con formato seguro: así nadie puede inyectar saltos
// de línea o texto engañoso en los logs. Si no llega o no sirve, se genera un UUID.
const formatoValido = /^[A-Za-z0-9_-]{1,100}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const entrante = req.get('X-Request-Id');
  const id = entrante !== undefined && formatoValido.test(entrante) ? entrante : randomUUID();

  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  contextoPeticion.run({ requestId: id }, next);
};
