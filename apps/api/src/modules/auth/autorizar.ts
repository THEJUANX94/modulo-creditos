import { puede, type Accion } from '@creditos/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../../shared/errores/appError';
import {
  origenDe,
  registrarEventoSeguridadAparte,
  rutaDe,
} from '../../shared/seguridad/eventosSeguridad';
import { usuarioDe } from './autenticar';

// Aplica la matriz de permisos de @creditos/shared (ADR 0016). Va después de autenticar().
export function autorizar(accion: Accion): RequestHandler {
  return async (req, _res, next) => {
    const usuario = usuarioDe(req);
    if (!puede(usuario.rol, accion)) {
      await registrarEventoSeguridadAparte(origenDe(req), {
        tipoEvento: 'ACCESO_DENEGADO',
        usuarioId: usuario.id,
        sesionId: usuario.sesionId,
        ruta: rutaDe(req),
        detalle: `${usuario.rol} no puede ${accion}`,
      });
      throw new AppError('SIN_PERMISO', 'Su rol no tiene permiso para esta acción');
    }
    next();
  };
}
