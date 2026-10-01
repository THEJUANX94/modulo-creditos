import type { Request, Response } from 'express';
import { AppError } from '../../shared/errores/appError';
import { responderExito } from '../../shared/http/respuestas';
import { logger } from '../../shared/logger';
import * as healthRepository from './healthRepository';

// Liveness: el proceso responde. No toca la BD, para que una caída de la BD no reinicie la API.
export function liveness(_req: Request, res: Response): void {
  responderExito(res, { estado: 'ok' });
}

// Readiness: la API puede atender, porque la BD responde. Si no, 503 y el orquestador deja de enviarle tráfico.
export async function readiness(_req: Request, res: Response): Promise<void> {
  try {
    await healthRepository.verificarConexion();
  } catch (error) {
    logger.warn({ err: error }, 'La base de datos no responde');
    throw new AppError('BD_NO_DISPONIBLE', 'La base de datos no responde');
  }
  responderExito(res, { estado: 'ok', baseDatos: 'ok' });
}
