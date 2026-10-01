import { prisma } from '../../shared/db/prisma';

export async function verificarConexion(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
