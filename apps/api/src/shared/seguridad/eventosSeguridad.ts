import type { Request } from 'express';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../db/prisma';
import { logger } from '../logger';

// Mismos valores que CK_EventosSeguridad_tipoEvento (002-esquema.sql).
export type TipoEventoSeguridad =
  | 'LOGIN_EXITOSO'
  | 'LOGIN_FALLIDO'
  | 'LOGOUT'
  | 'REFRESH'
  | 'REFRESH_REUTILIZADO'
  | 'SESION_REEMPLAZADA'
  | 'ACCESO_DENEGADO'
  | 'USUARIO_CREADO'
  | 'USUARIO_DESACTIVADO'
  | 'USUARIO_ACTIVADO'
  | 'USUARIO_ROL_CAMBIADO'
  | 'CONTRASENA_CAMBIADA';

export interface EventoSeguridad {
  tipoEvento: TipoEventoSeguridad;
  usuarioId?: string | null;
  usuarioAfectadoId?: string;
  sesionId?: bigint;
  correoIntentado?: string;
  ruta?: string;
  detalle?: string;
}

// De dónde vino la petición: acompaña a cada evento.
export interface OrigenPeticion {
  ip: string;
  userAgent: string | null;
  requestId: string | null;
}

export function origenDe(req: Request): OrigenPeticion {
  return {
    ip: (req.ip ?? 'desconocida').slice(0, 45),
    userAgent: req.get('User-Agent')?.slice(0, 300) ?? null,
    requestId: req.requestId,
  };
}

export function rutaDe(req: Request): string {
  return `${req.method} ${req.baseUrl}${req.path}`.slice(0, 200);
}

type ClienteBd = Prisma.TransactionClient | typeof prisma;

// Dentro de la transacción del cambio que registra: o se guardan los dos o ninguno (ADR 0016).
export async function registrarEventoSeguridad(
  cliente: ClienteBd,
  origen: OrigenPeticion,
  evento: EventoSeguridad,
): Promise<void> {
  await cliente.eventosSeguridad.create({ data: { ...evento, ...origen } });
}

// Para intentos fallidos y accesos denegados, que no tienen transacción de negocio:
// si el registro falla, se loguea y la respuesta al usuario no cambia.
export async function registrarEventoSeguridadAparte(
  origen: OrigenPeticion,
  evento: EventoSeguridad,
): Promise<void> {
  try {
    await registrarEventoSeguridad(prisma, origen, evento);
  } catch (error) {
    logger.error(
      { err: error, tipoEvento: evento.tipoEvento },
      'No se pudo registrar el evento de seguridad',
    );
  }
}
