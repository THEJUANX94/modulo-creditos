import type { RespuestaError } from '@creditos/shared';
import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errores/appError';
import { logger } from '../logger';

// Errores del parser de JSON de Express (body-parser).
interface ErrorParser {
  type?: string;
}

function aAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const tipo = (error as ErrorParser | null)?.type;
  if (tipo === 'entity.parse.failed') {
    return new AppError('VALIDACION_FALLIDA', 'El cuerpo de la petición no es un JSON válido');
  }
  if (tipo === 'entity.too.large') {
    return new AppError('CUERPO_DEMASIADO_GRANDE', 'El cuerpo de la petición supera los 100 KB');
  }

  // Inesperado: el detalle (stack, SQL) va solo al log, nunca a la respuesta.
  logger.error({ err: error }, 'Error no controlado');
  return new AppError(
    'ERROR_INTERNO',
    'Ocurrió un error inesperado. Si persiste, repórtelo con el requestId.',
  );
}

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const appError = aAppError(error);
  const cuerpo: RespuestaError = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details && { details: appError.details }),
    },
    requestId: req.requestId,
  };
  res.status(appError.status).json(cuerpo);
};
