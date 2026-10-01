import {
  esquemaCambiarEstado,
  esquemaCrearCredito,
  esquemaEditarCredito,
  esquemaEliminarCredito,
  esquemaFiltrosCreditos,
} from '@creditos/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { responderExito } from '../../shared/http/respuestas';
import { validarEntrada } from '../../shared/http/validacion';
import { origenDe, rutaDe } from '../../shared/seguridad/eventosSeguridad';
import { usuarioDe } from '../auth/autenticar';
import * as creditosService from './creditosService';

export const esquemaIdCredito = z.object({ id: z.uuid({ error: 'El id debe ser un UUID' }) });

function idDe(req: Request): string {
  return validarEntrada(esquemaIdCredito, req.params).id.toLowerCase();
}

export async function listar(req: Request, res: Response): Promise<void> {
  const filtros = validarEntrada(esquemaFiltrosCreditos, req.query);
  const { creditos, meta } = await creditosService.listar(filtros, usuarioDe(req));
  responderExito(res, creditos, { meta });
}

export async function resumen(_req: Request, res: Response): Promise<void> {
  responderExito(res, await creditosService.resumen());
}

export async function obtener(req: Request, res: Response): Promise<void> {
  responderExito(res, await creditosService.obtener(idDe(req), usuarioDe(req)));
}

export async function historial(req: Request, res: Response): Promise<void> {
  responderExito(res, await creditosService.historial(idDe(req), usuarioDe(req)));
}

export async function crear(req: Request, res: Response): Promise<void> {
  const datos = validarEntrada(esquemaCrearCredito, req.body);
  const credito = await creditosService.crear(datos, usuarioDe(req), origenDe(req));
  res.location(`/api/creditos/${credito.id}`);
  responderExito(res, credito, { status: 201 });
}

export async function editar(req: Request, res: Response): Promise<void> {
  const id = idDe(req);
  const datos = validarEntrada(esquemaEditarCredito, req.body);
  responderExito(res, await creditosService.editar(id, datos, usuarioDe(req), origenDe(req)));
}

export async function cambiarEstado(req: Request, res: Response): Promise<void> {
  const id = idDe(req);
  const datos = validarEntrada(esquemaCambiarEstado, req.body);
  responderExito(
    res,
    await creditosService.cambiarEstado(id, datos, usuarioDe(req), origenDe(req), rutaDe(req)),
  );
}

export async function eliminar(req: Request, res: Response): Promise<void> {
  const id = idDe(req);
  const datos = validarEntrada(esquemaEliminarCredito, req.body);
  await creditosService.eliminar(id, datos, usuarioDe(req), origenDe(req));
  responderExito(res, null);
}
