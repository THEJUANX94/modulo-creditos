import type { Request, Response } from 'express';
import { responderExito } from '../../shared/http/respuestas';
import * as catalogosService from './catalogosService';

export async function obtener(_req: Request, res: Response): Promise<void> {
  responderExito(res, await catalogosService.obtenerCatalogos());
}
