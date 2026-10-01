import {
  esquemaCambioContrasena,
  esquemaLogin,
  type RespuestaSesion,
  type UsuarioSesion,
} from '@creditos/shared';
import type { Request, Response } from 'express';
import { AppError } from '../../shared/errores/appError';
import { responderExito } from '../../shared/http/respuestas';
import { validarEntrada } from '../../shared/http/validacion';
import { origenDe } from '../../shared/seguridad/eventosSeguridad';
import * as authService from './authService';
import type { SesionEmitida } from './authService';
import { usuarioDe } from './autenticar';
import { borrarCookieRefresh, escribirCookieRefresh, leerCookieRefresh } from './cookieRefresh';

function responderSesion(res: Response, sesion: SesionEmitida): void {
  escribirCookieRefresh(res, sesion.refreshToken, sesion.expiraSesion);
  // Respuestas con tokens: que ningún proxy ni navegador las guarde en caché.
  res.setHeader('Cache-Control', 'no-store');
  const data: RespuestaSesion = {
    accessToken: sesion.accessToken,
    expiraEn: sesion.expiraEn.toISOString(),
    usuario: sesion.usuario,
  };
  responderExito(res, data);
}

export async function login(req: Request, res: Response): Promise<void> {
  const datos = validarEntrada(esquemaLogin, req.body);
  responderSesion(res, await authService.iniciarSesion(datos, origenDe(req)));
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    responderSesion(res, await authService.refrescarSesion(leerCookieRefresh(req), origenDe(req)));
  } catch (error) {
    if (error instanceof AppError && error.code === 'SESION_INVALIDA') borrarCookieRefresh(res);
    throw error;
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  await authService.cerrarSesion(leerCookieRefresh(req), origenDe(req));
  borrarCookieRefresh(res);
  responderExito(res, null);
}

export async function cambiarContrasena(req: Request, res: Response): Promise<void> {
  const datos = validarEntrada(esquemaCambioContrasena, req.body);
  responderSesion(res, await authService.cambiarContrasena(usuarioDe(req), datos, origenDe(req)));
}

export function me(req: Request, res: Response): void {
  const usuario = usuarioDe(req);
  const data: UsuarioSesion = {
    id: usuario.id,
    correo: usuario.correo,
    nombre: usuario.nombre,
    rol: usuario.rol,
    debeCambiarContrasena: usuario.debeCambiarContrasena,
  };
  responderExito(res, data);
}
