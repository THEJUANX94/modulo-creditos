import type { RequestHandler } from 'express';
import { AppError } from '../errores/appError';

// Defensa extra contra CSRF en las rutas que usan la cookie de refresh (ADR 0016): un formulario
// de otro sitio no puede enviar un header propio. Se suma a SameSite=Strict y a CORS restringido.
export const exigirCsrf: RequestHandler = (req, _res, next) => {
  if (req.get('X-CSRF') !== '1') {
    throw new AppError('CSRF_INVALIDO', 'Falta el header X-CSRF');
  }
  next();
};
