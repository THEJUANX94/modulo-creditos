import { defineConfig } from 'prisma/config';

// La CLI de Prisma no lee el .env por su cuenta: se carga con la función nativa de Node.
// Si el archivo no existe (CI, Docker), se usan las variables del entorno.
try {
  process.loadEnvFile('.env');
} catch {
  // Sin .env: no es un error.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Solo `prisma db pull` usa la BD, y necesita ver las definiciones de los objetos:
    // por eso usa la credencial de administrador. La app en ejecución usa DATABASE_URL.
    url: process.env.DATABASE_ADMIN_URL,
  },
});
