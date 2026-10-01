import { z } from 'zod';
import { roles } from './roles';

// Respuestas de autenticación y usuarios. El tipo de TypeScript sale del esquema: lo que documenta
// Swagger es lo que devuelve la API.

export const esquemaUsuarioSesion = z
  .object({
    id: z.uuid(),
    correo: z.email().meta({ example: 'asesor@creditos.test' }),
    nombre: z.string().meta({ example: 'Asesor Demo' }),
    rol: z.enum(roles),
    debeCambiarContrasena: z.boolean(),
  })
  .meta({ id: 'UsuarioSesion' });

export type UsuarioSesion = z.infer<typeof esquemaUsuarioSesion>;

// Respuesta de login, refresh y cambio de contraseña. El refresh token viaja aparte, en la cookie httpOnly.
export const esquemaRespuestaSesion = z
  .object({
    accessToken: z.string().meta({ description: 'JWT de 15 minutos. Guardar solo en memoria' }),
    expiraEn: z.iso.datetime(),
    usuario: esquemaUsuarioSesion,
  })
  .meta({ id: 'RespuestaSesion' });

export type RespuestaSesion = z.infer<typeof esquemaRespuestaSesion>;

export const esquemaUsuario = esquemaUsuarioSesion
  .extend({
    activo: z.boolean(),
    fechaCreacion: z.iso.datetime(),
  })
  .meta({ id: 'Usuario' });

export type Usuario = z.infer<typeof esquemaUsuario>;
