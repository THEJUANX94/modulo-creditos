import { Router } from 'express';
import { autenticar } from '../auth/autenticar';
import { autorizar } from '../auth/autorizar';
import * as catalogosController from './catalogosController';

export const catalogosRoutes = Router();

catalogosRoutes.get('/', autenticar(), autorizar('verCreditos'), catalogosController.obtener);
