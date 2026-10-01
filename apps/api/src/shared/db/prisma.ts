import { PrismaMssql } from '@prisma/adapter-mssql';
import { config } from '../../config/config';
import { PrismaClient } from '../../generated/prisma/client';
import { logger } from '../logger';

// Conecta con el login de la app (appCreditos, mínimo privilegio). Lo que Prisma no soporta
// del esquema (ROWVERSION, columnas calculadas) se hace con $queryRaw en los repositories (ADR 0003).
export const prisma = new PrismaClient({
  adapter: new PrismaMssql(config.databaseUrl),
  log: [
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
  ],
});

prisma.$on('warn', (evento) => logger.warn({ prisma: evento.message }, 'Advertencia de Prisma'));
prisma.$on('error', (evento) => logger.error({ prisma: evento.message }, 'Error de Prisma'));
