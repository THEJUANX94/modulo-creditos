import type { Rol, UsuarioSesion } from '@creditos/shared';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../shared/db/prisma';

type ClienteBd = Prisma.TransactionClient | typeof prisma;

// Mismos valores que CK_Sesiones_motivoRevocacion (002-esquema.sql).
export type MotivoRevocacion =
  | 'LOGOUT'
  | 'REUTILIZACION'
  | 'NUEVA_SESION'
  | 'USUARIO_DESACTIVADO'
  | 'ROL_CAMBIADO'
  | 'CONTRASENA_CAMBIADA';

export interface UsuarioConEstado extends UsuarioSesion {
  activo: boolean;
}

const camposUsuario = {
  id: true,
  correo: true,
  nombre: true,
  rol: true,
  activo: true,
  debeCambiarContrasena: true,
} as const;

interface FilaUsuario {
  id: string;
  correo: string;
  nombre: string;
  rol: string;
  activo: boolean;
  debeCambiarContrasena: boolean;
}

function aUsuario(fila: FilaUsuario): UsuarioConEstado {
  return { ...fila, rol: fila.rol as Rol };
}

export async function buscarUsuarioPorCorreo(
  correo: string,
): Promise<(UsuarioConEstado & { hashContrasena: string }) | null> {
  const fila = await prisma.usuarios.findUnique({
    where: { correo },
    select: { ...camposUsuario, hashContrasena: true },
  });
  return fila ? { ...aUsuario(fila), hashContrasena: fila.hashContrasena } : null;
}

export async function buscarHashContrasena(usuarioId: string): Promise<string | null> {
  const fila = await prisma.usuarios.findUnique({
    where: { id: usuarioId },
    select: { hashContrasena: true },
  });
  return fila?.hashContrasena ?? null;
}

// Una consulta por petición autenticada: la sesión sigue viva y el usuario sigue activo.
export async function obtenerUsuarioDeSesionVigente(
  sesionId: bigint,
  usuarioId: string,
  ahora: Date,
): Promise<UsuarioConEstado | null> {
  const sesion = await prisma.sesiones.findFirst({
    where: { id: sesionId, usuarioId, fechaRevocacion: null, fechaExpiracion: { gt: ahora } },
    select: { Usuarios: { select: camposUsuario } },
  });
  if (!sesion?.Usuarios.activo) return null;
  return aUsuario(sesion.Usuarios);
}

// Revoca la sesión activa del usuario, si la hay, y devuelve su id.
export async function revocarSesionActiva(
  tx: ClienteBd,
  usuarioId: string,
  motivo: MotivoRevocacion,
  ahora: Date,
): Promise<bigint | null> {
  const activa = await tx.sesiones.findFirst({
    where: { usuarioId, fechaRevocacion: null },
    select: { id: true },
  });
  if (!activa) return null;
  await revocarSesion(tx, activa.id, motivo, ahora);
  return activa.id;
}

export async function revocarSesion(
  tx: ClienteBd,
  sesionId: bigint,
  motivo: MotivoRevocacion,
  ahora: Date,
): Promise<boolean> {
  const { count } = await tx.sesiones.updateMany({
    where: { id: sesionId, fechaRevocacion: null },
    data: { fechaRevocacion: ahora, motivoRevocacion: motivo },
  });
  return count > 0;
}

export async function crearSesion(
  tx: ClienteBd,
  datos: { usuarioId: string; ip: string; userAgent: string | null; fechaExpiracion: Date },
): Promise<bigint> {
  const sesion = await tx.sesiones.create({ data: datos, select: { id: true } });
  return sesion.id;
}

export async function crearRefreshToken(
  tx: ClienteBd,
  sesionId: bigint,
  hashToken: Buffer,
  requestId: string | null,
): Promise<void> {
  await tx.refreshTokens.create({
    data: { sesionId, hashToken: new Uint8Array(hashToken), requestId },
  });
}

export async function buscarRefreshToken(hashToken: Buffer) {
  const fila = await prisma.refreshTokens.findUnique({
    where: { hashToken: new Uint8Array(hashToken) },
    select: {
      id: true,
      fechaUso: true,
      Sesiones: {
        select: {
          id: true,
          usuarioId: true,
          fechaExpiracion: true,
          fechaRevocacion: true,
          Usuarios: { select: camposUsuario },
        },
      },
    },
  });
  if (!fila) return null;
  const { Usuarios: usuario, ...sesion } = fila.Sesiones;
  return { id: fila.id, fechaUso: fila.fechaUso, sesion, usuario: aUsuario(usuario) };
}

// Marca el token como usado solo si nadie lo marcó antes: devuelve false si otra petición ganó.
export async function marcarRefreshUsado(tx: ClienteBd, id: bigint, ahora: Date): Promise<boolean> {
  const { count } = await tx.refreshTokens.updateMany({
    where: { id, fechaUso: null },
    data: { fechaUso: ahora },
  });
  return count === 1;
}

export async function actualizarContrasena(
  tx: ClienteBd,
  usuarioId: string,
  hashContrasena: string,
  ahora: Date,
): Promise<void> {
  await tx.usuarios.update({
    where: { id: usuarioId },
    data: { hashContrasena, debeCambiarContrasena: false, fechaActualizacion: ahora },
  });
}
