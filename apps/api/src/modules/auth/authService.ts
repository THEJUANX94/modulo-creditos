import type { DatosCambioContrasena, DatosLogin, UsuarioSesion } from '@creditos/shared';
import type { Prisma } from '../../generated/prisma/client';
import { esViolacionUnica } from '../../shared/db/erroresBd';
import { prisma } from '../../shared/db/prisma';
import { AppError } from '../../shared/errores/appError';
import { logger } from '../../shared/logger';
import {
  registrarEventoSeguridad,
  registrarEventoSeguridadAparte,
  type OrigenPeticion,
} from '../../shared/seguridad/eventosSeguridad';
import * as authRepository from './authRepository';
import type { UsuarioConEstado } from './authRepository';
import type { UsuarioAutenticado } from './autenticar';
import { hashearContrasena, obtenerHashFicticio, verificarContrasena } from './contrasenas';
import { duracionSesionMs, graciaReusoRefreshMs } from './politicaSesion';
import { firmarAccessToken, generarRefreshToken, hashRefreshToken } from './tokens';

export interface SesionEmitida {
  accessToken: string;
  expiraEn: Date;
  refreshToken: string;
  expiraSesion: Date;
  usuario: UsuarioSesion;
}

interface SesionCreada {
  sesionId: bigint;
  refreshToken: string;
  expiraSesion: Date;
}

function sesionInvalida(): AppError {
  return new AppError('SESION_INVALIDA', 'La sesión venció o fue cerrada. Inicie sesión de nuevo.');
}

function aUsuarioSesion(usuario: UsuarioConEstado): UsuarioSesion {
  return {
    id: usuario.id,
    correo: usuario.correo,
    nombre: usuario.nombre,
    rol: usuario.rol,
    debeCambiarContrasena: usuario.debeCambiarContrasena,
  };
}

async function crearSesionConToken(
  tx: Prisma.TransactionClient,
  usuarioId: string,
  origen: OrigenPeticion,
  ahora: Date,
): Promise<SesionCreada> {
  const expiraSesion = new Date(ahora.getTime() + duracionSesionMs);
  const sesionId = await authRepository.crearSesion(tx, {
    usuarioId,
    ip: origen.ip,
    userAgent: origen.userAgent,
    fechaExpiracion: expiraSesion,
  });
  const { token, hash } = generarRefreshToken();
  await authRepository.crearRefreshToken(tx, sesionId, hash, origen.requestId);
  return { sesionId, refreshToken: token, expiraSesion };
}

async function emitir(
  usuario: UsuarioConEstado,
  sesionId: bigint,
  refreshToken: string,
  expiraSesion: Date,
): Promise<SesionEmitida> {
  const { token, expiraEn } = await firmarAccessToken({
    usuarioId: usuario.id,
    sesionId,
    rol: usuario.rol,
  });
  return {
    accessToken: token,
    expiraEn,
    refreshToken,
    expiraSesion,
    usuario: aUsuarioSesion(usuario),
  };
}

export async function iniciarSesion(
  datos: DatosLogin,
  origen: OrigenPeticion,
): Promise<SesionEmitida> {
  const usuario = await authRepository.buscarUsuarioPorCorreo(datos.correo);
  // Se verifica siempre una contraseña, aunque el correo no exista: el tiempo de respuesta no
  // delata qué correos están registrados.
  const hash = usuario?.hashContrasena ?? (await obtenerHashFicticio());
  const contrasenaCorrecta = await verificarContrasena(hash, datos.contrasena);

  if (!usuario || !contrasenaCorrecta || !usuario.activo) {
    let motivo = 'Contraseña incorrecta';
    if (!usuario) motivo = 'Correo no registrado';
    else if (!usuario.activo) motivo = 'Usuario inactivo';

    await registrarEventoSeguridadAparte(origen, {
      tipoEvento: 'LOGIN_FALLIDO',
      usuarioId: usuario?.id ?? null,
      correoIntentado: datos.correo,
      detalle: motivo,
    });
    throw new AppError('CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos');
  }

  const crear = () =>
    prisma.$transaction(async (tx) => {
      const ahora = new Date();
      // Una sola sesión por usuario: el login nuevo reemplaza a la anterior (ADR 0016).
      const anterior = await authRepository.revocarSesionActiva(
        tx,
        usuario.id,
        'NUEVA_SESION',
        ahora,
      );
      const nueva = await crearSesionConToken(tx, usuario.id, origen, ahora);
      if (anterior !== null) {
        await registrarEventoSeguridad(tx, origen, {
          tipoEvento: 'SESION_REEMPLAZADA',
          usuarioId: usuario.id,
          sesionId: anterior,
          detalle: `Reemplazada por la sesión ${nueva.sesionId}`,
        });
      }
      await registrarEventoSeguridad(tx, origen, {
        tipoEvento: 'LOGIN_EXITOSO',
        usuarioId: usuario.id,
        sesionId: nueva.sesionId,
      });
      return nueva;
    });

  // Dos logins simultáneos del mismo usuario chocan en UX_Sesiones_activa: el segundo se reintenta
  // y reemplaza al primero, como si hubiera llegado después.
  let nueva: SesionCreada;
  try {
    nueva = await crear();
  } catch (error) {
    if (!esViolacionUnica(error)) throw error;
    nueva = await crear();
  }

  return emitir(usuario, nueva.sesionId, nueva.refreshToken, nueva.expiraSesion);
}

export async function refrescarSesion(
  refreshToken: string | undefined,
  origen: OrigenPeticion,
): Promise<SesionEmitida> {
  if (!refreshToken) throw sesionInvalida();

  const registro = await authRepository.buscarRefreshToken(hashRefreshToken(refreshToken));
  if (!registro) throw sesionInvalida();

  const { sesion, usuario } = registro;
  const ahora = new Date();
  const vigente =
    sesion.fechaRevocacion === null && sesion.fechaExpiracion > ahora && usuario.activo;
  if (!vigente) throw sesionInvalida();

  const fueraDeGracia =
    registro.fechaUso !== null &&
    ahora.getTime() - registro.fechaUso.getTime() > graciaReusoRefreshMs;

  if (fueraDeGracia) {
    // Un token ya rotado vuelve a aparecer: señal de robo. Se cierra la sesión para el ladrón y la víctima.
    await prisma.$transaction(async (tx) => {
      await authRepository.revocarSesion(tx, sesion.id, 'REUTILIZACION', ahora);
      await registrarEventoSeguridad(tx, origen, {
        tipoEvento: 'REFRESH_REUTILIZADO',
        usuarioId: usuario.id,
        sesionId: sesion.id,
      });
    });
    logger.warn({ sesionId: sesion.id.toString() }, 'Reuso de refresh token: sesión revocada');
    throw sesionInvalida();
  }

  // Dentro de la gracia (dos pestañas a la vez) se emite otro token de la misma sesión sin revocarla.
  const nuevoToken = await prisma.$transaction(async (tx) => {
    if (registro.fechaUso === null) await authRepository.marcarRefreshUsado(tx, registro.id, ahora);
    const { token, hash } = generarRefreshToken();
    await authRepository.crearRefreshToken(tx, sesion.id, hash, origen.requestId);
    await registrarEventoSeguridad(tx, origen, {
      tipoEvento: 'REFRESH',
      usuarioId: usuario.id,
      sesionId: sesion.id,
    });
    return token;
  });

  // La sesión no se extiende: el nuevo refresh vence cuando vence la sesión.
  return emitir(usuario, sesion.id, nuevoToken, sesion.fechaExpiracion);
}

// Idempotente: sin cookie, con una cookie inválida o con la sesión ya cerrada, no hace nada.
export async function cerrarSesion(
  refreshToken: string | undefined,
  origen: OrigenPeticion,
): Promise<void> {
  if (!refreshToken) return;
  const registro = await authRepository.buscarRefreshToken(hashRefreshToken(refreshToken));
  if (!registro || registro.sesion.fechaRevocacion !== null) return;

  await prisma.$transaction(async (tx) => {
    const revocada = await authRepository.revocarSesion(
      tx,
      registro.sesion.id,
      'LOGOUT',
      new Date(),
    );
    if (revocada) {
      await registrarEventoSeguridad(tx, origen, {
        tipoEvento: 'LOGOUT',
        usuarioId: registro.usuario.id,
        sesionId: registro.sesion.id,
      });
    }
  });
}

export async function cambiarContrasena(
  actual: UsuarioAutenticado,
  datos: DatosCambioContrasena,
  origen: OrigenPeticion,
): Promise<SesionEmitida> {
  const hashActual = await authRepository.buscarHashContrasena(actual.id);
  if (!hashActual || !(await verificarContrasena(hashActual, datos.contrasenaActual))) {
    throw new AppError('VALIDACION_FALLIDA', 'Hay campos con errores', [
      { campo: 'contrasenaActual', mensaje: 'La contraseña actual no es correcta' },
    ]);
  }
  if (datos.contrasenaNueva.toLowerCase() === actual.correo.toLowerCase()) {
    throw new AppError('VALIDACION_FALLIDA', 'Hay campos con errores', [
      { campo: 'contrasenaNueva', mensaje: 'La contraseña no puede ser igual al correo' },
    ]);
  }

  const hashNuevo = await hashearContrasena(datos.contrasenaNueva);
  const nueva = await prisma.$transaction(async (tx) => {
    const ahora = new Date();
    await authRepository.actualizarContrasena(tx, actual.id, hashNuevo, ahora);
    // Cambiar la contraseña cierra la sesión actual y abre una nueva.
    await authRepository.revocarSesion(tx, actual.sesionId, 'CONTRASENA_CAMBIADA', ahora);
    const sesion = await crearSesionConToken(tx, actual.id, origen, ahora);
    await registrarEventoSeguridad(tx, origen, {
      tipoEvento: 'CONTRASENA_CAMBIADA',
      usuarioId: actual.id,
      usuarioAfectadoId: actual.id,
      sesionId: sesion.sesionId,
    });
    return sesion;
  });

  return emitir(
    { ...actual, activo: true, debeCambiarContrasena: false },
    nueva.sesionId,
    nueva.refreshToken,
    nueva.expiraSesion,
  );
}
