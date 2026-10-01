import type { ItemCatalogo } from '@creditos/shared';
import { prisma } from '../../shared/db/prisma';

const campos = { codigo: true, nombre: true } as const;
const soloActivos = {
  where: { activo: true },
  select: campos,
  orderBy: { nombre: 'asc' },
} as const;

export async function listarActivos(): Promise<{
  tiposCredito: ItemCatalogo[];
  formasPago: ItemCatalogo[];
  tiposIdentificacion: ItemCatalogo[];
}> {
  const [tiposCredito, formasPago, tiposIdentificacion] = await Promise.all([
    prisma.tiposCredito.findMany(soloActivos),
    prisma.formasPago.findMany(soloActivos),
    prisma.tiposIdentificacion.findMany(soloActivos),
  ]);
  return { tiposCredito, formasPago, tiposIdentificacion };
}

export async function tipoCreditoActivo(codigo: string): Promise<boolean> {
  const fila = await prisma.tiposCredito.findFirst({
    where: { codigo, activo: true },
    select: campos,
  });
  return fila !== null;
}

export async function formaPagoActiva(codigo: string): Promise<boolean> {
  const fila = await prisma.formasPago.findFirst({
    where: { codigo, activo: true },
    select: campos,
  });
  return fila !== null;
}

export async function tipoIdentificacionActivo(codigo: string): Promise<boolean> {
  const fila = await prisma.tiposIdentificacion.findFirst({
    where: { codigo, activo: true },
    select: campos,
  });
  return fila !== null;
}
