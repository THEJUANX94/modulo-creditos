import { Router } from 'express';
import * as healthController from './healthController';

export const healthRoutes = Router();

healthRoutes.get('/', healthController.liveness);
healthRoutes.get('/ready', healthController.readiness);
