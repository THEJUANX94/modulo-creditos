import type { Paginacion, Rol, Usuario } from '@creditos/shared';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../shared/db/prisma';

type ClienteBd = Prisma.TransactionClient | typeof prisma;

const campos = {
  id: true,
  correo: true,
  nombre: true,
  rol: true,
  activo: true,
  debeCambiarContrasena: true,
  fechaCreacion: true,
} as const;

interface FilaUsuario {
  id: string;
  correo: string;
  nombre: string;
  rol: string;
  activo: boolean;
  debeCambiarContrasena: boolean;
  fechaCreacion: Date;
}

function aUsuario(fila: FilaUsuario): Usuario {
  return { ...fila, rol: fila.rol as Rol, fechaCreacion: fila.fechaCreacion.toISOString() };
}

export async function listar({
  pagina,
  tamanoPagina,
}: Paginacion): Promise<{ usuarios: Usuario[]; total: number }> {
  const [filas, total] = await prisma.$transaction([
    prisma.usuarios.findMany({
      select: campos,
      orderBy: [{ nombre: 'asc' }, { consecutivo: 'asc' }],
      skip: (pagina - 1) * tamanoPagina,
      take: tamanoPagina,
    }),
    prisma.usuarios.count(),
  ]);
  return { usuarios: filas.map(aUsuario), total };
}

export async function buscarPorId(id: string): Promise<Usuario | null> {
  const fila = await prisma.usuarios.findUnique({ where: { id }, select: campos });
  return fila ? aUsuario(fila) : null;
}

export async function crear(
  tx: ClienteBd,
  datos: { correo: string; nombre: string; rol: Rol; hashContrasena: string },
): Promise<Usuario> {
  // La contraseña que asigna el ADMIN es temporal (ADR 0016).
  const fila = await tx.usuarios.create({
    data: { ...datos, debeCambiarContrasena: true },
    select: campos,
  });
  return aUsuario(fila);
}

export async function actualizarEstado(
  tx: ClienteBd,
  id: string,
  activo: boolean,
  ahora: Date,
): Promise<Usuario> {
  const fila = await tx.usuarios.update({
    where: { id },
    data: { activo, fechaActualizacion: ahora },
    select: campos,
  });
  return aUsuario(fila);
}

export async function actualizarRol(
  tx: ClienteBd,
  id: string,
  rol: Rol,
  ahora: Date,
): Promise<Usuario> {
  const fila = await tx.usuarios.update({
    where: { id },
    data: { rol, fechaActualizacion: ahora },
    select: campos,
  });
  return aUsuario(fila);
}
