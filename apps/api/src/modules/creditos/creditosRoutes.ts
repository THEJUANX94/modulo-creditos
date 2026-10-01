import { Router } from 'express';
import { autenticar } from '../auth/autenticar';
import { autorizar } from '../auth/autorizar';
import * as creditosController from './creditosController';

export const creditosRoutes = Router();

creditosRoutes.use(autenticar());

creditosRoutes.get('/', autorizar('verCreditos'), creditosController.listar);
// Antes de /:id, para que "resumen" no se lea como un id.
creditosRoutes.get('/resumen', autorizar('verCreditos'), creditosController.resumen);
creditosRoutes.get('/:id', autorizar('verCreditos'), creditosController.obtener);
creditosRoutes.get('/:id/historial', autorizar('verCreditos'), creditosController.historial);
creditosRoutes.post('/', autorizar('crearCredito'), creditosController.crear);
creditosRoutes.patch('/:id', autorizar('editarCredito'), creditosController.editar);
// El permiso depende del estado destino (va en el cuerpo): lo verifica el service.
creditosRoutes.patch('/:id/estado', creditosController.cambiarEstado);
creditosRoutes.delete('/:id', autorizar('eliminarCredito'), creditosController.eliminar);
