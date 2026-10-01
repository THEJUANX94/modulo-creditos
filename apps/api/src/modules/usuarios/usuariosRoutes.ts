import { Router } from 'express';
import { autenticar } from '../auth/autenticar';
import { autorizar } from '../auth/autorizar';
import * as usuariosController from './usuariosController';

// Gestión de usuarios: solo ADMIN (ADR 0016).
export const usuariosRoutes = Router();

usuariosRoutes.use(autenticar(), autorizar('gestionarUsuarios'));

usuariosRoutes.get('/', usuariosController.listar);
usuariosRoutes.post('/', usuariosController.crear);
usuariosRoutes.patch('/:id/estado', usuariosController.cambiarEstado);
usuariosRoutes.patch('/:id/rol', usuariosController.cambiarRol);
