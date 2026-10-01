import { afterAll } from 'vitest';
import { prisma } from '../../../src/shared/db/prisma';

// Cada archivo de pruebas carga sus propios módulos, con su propio cliente de Prisma: se cierra al
// terminar para no acumular conexiones.
afterAll(async () => {
  await prisma.$disconnect();
});
