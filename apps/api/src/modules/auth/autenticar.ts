import type { UsuarioSesion } from '@creditos/shared';
import type { Request, RequestHandler } from 'express';
import { errors } from 'jose';
import { contextoPeticion } from '../../shared/contextoPeticion';
import { AppError } from '../../shared/errores/appError';
import {
  origenDe,
  registrarEventoSeguridadAparte,
  rutaDe,
} from '../../shared/seguridad/eventosSeguridad';
import * as authRepository from './authRepository';
import { verificarAccessToken, type ClaimsAcceso } from './tokens';

export interface UsuarioAutenticado extends UsuarioSesion {
  sesionId: bigint;
}

declare module 'express-serve-static-core' {
  interface Request {
    usuario?: UsuarioAutenticado;
  }
}

interface OpcionesAutenticar {
  // Rutas que puede usar quien todavía debe cambiar su contraseña temporal (/me, /contrasena).
  permitirCambioPendiente?: boolean;
}

// Verifica el access token y, con una consulta, que su sesión siga viva y el usuario activo
// (ADR 0016): un login nuevo, una desactivación o un cambio de rol cortan la sesión de inmediato.
export function autenticar(opciones: OpcionesAutenticar = {}): RequestHandler {
  return async (req, _res, next) => {
    const cabecera = req.get('Authorization');
    if (!cabecera?.startsWith('Bearer ')) {
      throw new AppError('NO_AUTENTICADO', 'Falta el access token');
    }

    let claims: ClaimsAcceso;
    try {
      claims = await verificarAccessToken(cabecera.slice('Bearer '.length));
    } catch (error) {
      // Un token vencido es el flujo normal (el frontend refresca): no se registra.
      if (error instanceof errors.JWTExpired) {
        throw new AppError('NO_AUTENTICADO', 'El access token venció');
      }
      // Firma inválida, token manipulado o mal formado: sí se registra.
      await registrarEventoSeguridadAparte(origenDe(req), {
        tipoEvento: 'ACCESO_DENEGADO',
        ruta: rutaDe(req),
        detalle: 'Access token inválido',
      });
      throw new AppError('NO_AUTENTICADO', 'El access token no es válido');
    }

    const usuario = await authRepository.obtenerUsuarioDeSesionVigente(
      claims.sesionId,
      claims.usuarioId,
      new Date(),
    );
    if (!usuario) {
      throw new AppError('SESION_INVALIDA', 'La sesión ya no es válida. Inicie sesión de nuevo.');
    }
    if (usuario.debeCambiarContrasena && !opciones.permitirCambioPendiente) {
      throw new AppError(
        'CAMBIO_CONTRASENA_REQUERIDO',
        'Debe cambiar su contraseña temporal antes de continuar',
      );
    }

    // El rol sale de la BD, no del token: siempre el vigente.
    req.usuario = {
      id: usuario.id,
      correo: usuario.correo,
      nombre: usuario.nombre,
      rol: usuario.rol,
      debeCambiarContrasena: usuario.debeCambiarContrasena,
      sesionId: claims.sesionId,
    };
    const contexto = contextoPeticion.getStore();
    if (contexto) contexto.usuarioId = usuario.id;
    next();
  };
}

export function usuarioDe(req: Request): UsuarioAutenticado {
  if (!req.usuario) throw new AppError('NO_AUTENTICADO', 'La ruta requiere autenticación');
  return req.usuario;
}
