import { Router } from 'express';
import { autenticar } from '../auth/autenticar';
import { autorizar } from '../auth/autorizar';
import * as webhooksController from './webhooksController';

// Traza del webhook: solo lectura y solo ADMIN (ADR 0016, ADR 0018).
export const webhooksRoutes = Router();

webhooksRoutes.use(autenticar(), autorizar('verTrazaWebhook'));

webhooksRoutes.get('/eventos', webhooksController.listar);
webhooksRoutes.get('/eventos/:eventId', webhooksController.obtener);
