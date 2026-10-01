import type { RequestHandler } from 'express';
import { AppError } from '../errores/appError';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError('RUTA_NO_ENCONTRADA', `No existe la ruta ${req.method} ${req.path}`));
};
