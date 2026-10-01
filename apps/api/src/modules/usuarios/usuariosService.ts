import type { DatosCrearUsuario, MetaPaginacion, Paginacion, Rol, Usuario } from '@creditos/shared';
import { esViolacionUnica } from '../../shared/db/erroresBd';
import { prisma } from '../../shared/db/prisma';
import { AppError } from '../../shared/errores/appError';
import {
  registrarEventoSeguridad,
  type OrigenPeticion,
} from '../../shared/seguridad/eventosSeguridad';
import * as authRepository from '../auth/authRepository';
import type { UsuarioAutenticado } from '../auth/autenticar';
import { hashearContrasena } from '../auth/contrasenas';
import * as usuariosRepository from './usuariosRepository';

function mismoUsuario(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

// Un ADMIN no puede desactivarse ni cambiarse el rol a sí mismo: así siempre queda al menos uno.
function impedirSobreSiMismo(id: string, actor: UsuarioAutenticado, accion: string): void {
  if (mismoUsuario(id, actor.id)) {
    throw new AppError('SIN_PERMISO', `No puede ${accion} su propio usuario`);
  }
}

async function obtenerOFallar(id: string): Promise<Usuario> {
  const usuario = await usuariosRepository.buscarPorId(id);
  if (!usuario) throw new AppError('USUARIO_NOT_FOUND', 'El usuario no existe');
  return usuario;
}

export async function listar(
  paginacion: Paginacion,
): Promise<{ usuarios: Usuario[]; meta: MetaPaginacion }> {
  const { usuarios, total } = await usuariosRepository.listar(paginacion);
  return {
    usuarios,
    meta: { ...paginacion, total, totalPaginas: Math.ceil(total / paginacion.tamanoPagina) },
  };
}

export async function crear(
  datos: DatosCrearUsuario,
  actor: UsuarioAutenticado,
  origen: OrigenPeticion,
): Promise<Usuario> {
  const hashContrasena = await hashearContrasena(datos.contrasenaTemporal);
  try {
    return await prisma.$transaction(async (tx) => {
      const usuario = await usuariosRepository.crear(tx, {
        correo: datos.correo,
        nombre: datos.nombre,
        rol: datos.rol,
        hashContrasena,
      });
      await registrarEventoSeguridad(tx, origen, {
        tipoEvento: 'USUARIO_CREADO',
        usuarioId: actor.id,
        usuarioAfectadoId: usuario.id,
        detalle: `Rol ${usuario.rol}`,
      });
      return usuario;
    });
  } catch (error) {
    if (esViolacionUnica(error)) {
      throw new AppError('CORREO_DUPLICADO', 'Ya existe un usuario con ese correo');
    }
    throw error;
  }
}

export async function cambiarEstado(
  id: string,
  activo: boolean,
  actor: UsuarioAutenticado,
  origen: OrigenPeticion,
): Promise<Usuario> {
  impedirSobreSiMismo(id, actor, activo ? 'activar' : 'desactivar');
  const usuario = await obtenerOFallar(id);
  if (usuario.activo === activo) return usuario;

  return prisma.$transaction(async (tx) => {
    const ahora = new Date();
    const actualizado = await usuariosRepository.actualizarEstado(tx, id, activo, ahora);
    // Desactivar corta la sesión de inmediato (ADR 0016).
    if (!activo) await authRepository.revocarSesionActiva(tx, id, 'USUARIO_DESACTIVADO', ahora);
    await registrarEventoSeguridad(tx, origen, {
      tipoEvento: activo ? 'USUARIO_ACTIVADO' : 'USUARIO_DESACTIVADO',
      usuarioId: actor.id,
      usuarioAfectadoId: id,
    });
    return actualizado;
  });
}

export async function cambiarRol(
  id: string,
  rol: Rol,
  actor: UsuarioAutenticado,
  origen: OrigenPeticion,
): Promise<Usuario> {
  impedirSobreSiMismo(id, actor, 'cambiar el rol de');
  const usuario = await obtenerOFallar(id);
  if (usuario.rol === rol) return usuario;

  return prisma.$transaction(async (tx) => {
    const ahora = new Date();
    const actualizado = await usuariosRepository.actualizarRol(tx, id, rol, ahora);
    // El token nuevo tiene que traer el rol nuevo: se corta la sesión.
    await authRepository.revocarSesionActiva(tx, id, 'ROL_CAMBIADO', ahora);
    await registrarEventoSeguridad(tx, origen, {
      tipoEvento: 'USUARIO_ROL_CAMBIADO',
      usuarioId: actor.id,
      usuarioAfectadoId: id,
      detalle: `${usuario.rol} → ${rol}`,
    });
    return actualizado;
  });
}
