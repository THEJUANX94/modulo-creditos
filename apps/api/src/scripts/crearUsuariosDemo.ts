// Crea un usuario demo por rol (ADR 0016). Es idempotente: si el correo ya existe, no lo toca.
// Uso: pnpm -F @creditos/api usuarios:crear  (lee USUARIOS_DEMO_CLAVE del .env de la API)
// En Docker lo corre el servicio usuariosDemo del docker-compose, compilado a dist/ (ADR 0022).
import { esquemaContrasenaNueva, roles, type Rol } from '@creditos/shared';
import { z } from 'zod';
import { hashearContrasena } from '../modules/auth/contrasenas';
import { prisma } from '../shared/db/prisma';
import { registrarEventoSeguridad } from '../shared/seguridad/eventosSeguridad';

const nombres: Record<Rol, string> = {
  ASESOR: 'Asesor Demo',
  ANALISTA: 'Analista Demo',
  TESORERIA: 'Tesorería Demo',
  ADMIN: 'Administrador Demo',
};

// Es un script de una sola vez, no un módulo de la API: lee su variable directamente.
const variable = z.object({ USUARIOS_DEMO_CLAVE: esquemaContrasenaNueva }).safeParse(process.env);

if (!variable.success) {
  console.error(`USUARIOS_DEMO_CLAVE inválida:\n${z.prettifyError(variable.error)}`);
  process.exit(1);
}

// La misma contraseña para los cuatro usuarios demo, sin cambio obligatorio, para facilitar la evaluación.
const hashContrasena = await hashearContrasena(variable.data.USUARIOS_DEMO_CLAVE);

for (const rol of roles) {
  const correo = `${rol.toLowerCase()}@creditos.test`;
  const existente = await prisma.usuarios.findUnique({ where: { correo }, select: { id: true } });
  if (existente) {
    console.log(`= ${correo} ya existe`);
    continue;
  }

  await prisma.$transaction(async (tx) => {
    const usuario = await tx.usuarios.create({
      data: { correo, nombre: nombres[rol], rol, hashContrasena, debeCambiarContrasena: false },
      select: { id: true },
    });
    await registrarEventoSeguridad(
      tx,
      { ip: 'local', userAgent: 'crearUsuariosDemo', requestId: null },
      {
        tipoEvento: 'USUARIO_CREADO',
        usuarioAfectadoId: usuario.id,
        detalle: `Usuario demo, rol ${rol}`,
      },
    );
  });
  console.log(`+ ${correo} creado (${rol})`);
}

await prisma.$disconnect();
