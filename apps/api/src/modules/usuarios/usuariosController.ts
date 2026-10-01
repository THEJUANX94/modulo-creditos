import {
  esquemaCambiarEstadoUsuario,
  esquemaCambiarRolUsuario,
  esquemaCrearUsuario,
  esquemaPaginacion,
} from '@creditos/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { responderExito } from '../../shared/http/respuestas';
import { validarEntrada } from '../../shared/http/validacion';
import { origenDe } from '../../shared/seguridad/eventosSeguridad';
import { usuarioDe } from '../auth/autenticar';
import * as usuariosService from './usuariosService';

const esquemaId = z.object({ id: z.uuid({ error: 'El id debe ser un UUID' }) });

export async function listar(req: Request, res: Response): Promise<void> {
  const paginacion = validarEntrada(esquemaPaginacion, req.query);
  const { usuarios, meta } = await usuariosService.listar(paginacion);
  responderExito(res, usuarios, { meta });
}

export async function crear(req: Request, res: Response): Promise<void> {
  const datos = validarEntrada(esquemaCrearUsuario, req.body);
  const usuario = await usuariosService.crear(datos, usuarioDe(req), origenDe(req));
  responderExito(res, usuario, { status: 201 });
}

export async function cambiarEstado(req: Request, res: Response): Promise<void> {
  const { id } = validarEntrada(esquemaId, req.params);
  const { activo } = validarEntrada(esquemaCambiarEstadoUsuario, req.body);
  responderExito(
    res,
    await usuariosService.cambiarEstado(id, activo, usuarioDe(req), origenDe(req)),
  );
}

export async function cambiarRol(req: Request, res: Response): Promise<void> {
  const { id } = validarEntrada(esquemaId, req.params);
  const { rol } = validarEntrada(esquemaCambiarRolUsuario, req.body);
  responderExito(res, await usuariosService.cambiarRol(id, rol, usuarioDe(req), origenDe(req)));
}
