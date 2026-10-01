import { z } from 'zod';
import { roles } from './roles';

// Política de contraseñas (NIST 800-63B / OWASP): solo longitud, sin reglas de composición,
// que producen contraseñas predecibles. Que no sea igual al correo se valida donde se conocen ambos.
export const contrasenaMinima = 12;
export const contrasenaMaxima = 128;

export const esquemaContrasenaNueva = z
  .string({ error: 'La contraseña es obligatoria' })
  .min(contrasenaMinima, `La contraseña debe tener al menos ${contrasenaMinima} caracteres`)
  .max(contrasenaMaxima, `La contraseña puede tener como máximo ${contrasenaMaxima} caracteres`);

const esquemaCorreo = z
  .email({ error: 'El correo no es válido' })
  .max(254, 'El correo puede tener como máximo 254 caracteres')
  .transform((correo) => correo.toLowerCase());

// El login no aplica la política: solo exige que la contraseña venga.
export const esquemaLogin = z.object({
  correo: esquemaCorreo,
  contrasena: z
    .string({ error: 'La contraseña es obligatoria' })
    .min(1, 'La contraseña es obligatoria')
    .max(contrasenaMaxima, `La contraseña puede tener como máximo ${contrasenaMaxima} caracteres`),
});

export const esquemaCambioContrasena = z
  .object({
    contrasenaActual: z.string({ error: 'La contraseña actual es obligatoria' }).min(1),
    contrasenaNueva: esquemaContrasenaNueva,
  })
  .refine((datos) => datos.contrasenaNueva !== datos.contrasenaActual, {
    error: 'La contraseña nueva debe ser distinta de la actual',
    path: ['contrasenaNueva'],
  });

export const esquemaRol = z.enum(roles, { error: `El rol debe ser uno de: ${roles.join(', ')}` });

export const esquemaCrearUsuario = z
  .object({
    correo: esquemaCorreo,
    nombre: z
      .string({ error: 'El nombre es obligatorio' })
      .trim()
      .min(1, 'El nombre es obligatorio')
      .max(150, 'El nombre puede tener como máximo 150 caracteres'),
    rol: esquemaRol,
    contrasenaTemporal: esquemaContrasenaNueva,
  })
  .refine((datos) => datos.contrasenaTemporal.toLowerCase() !== datos.correo, {
    error: 'La contraseña no puede ser igual al correo',
    path: ['contrasenaTemporal'],
  });

export const esquemaCambiarEstadoUsuario = z.object({
  activo: z.boolean({ error: 'activo debe ser true o false' }),
});

export const esquemaCambiarRolUsuario = z.object({ rol: esquemaRol });

export type DatosLogin = z.infer<typeof esquemaLogin>;
export type DatosCambioContrasena = z.infer<typeof esquemaCambioContrasena>;
export type DatosCrearUsuario = z.infer<typeof esquemaCrearUsuario>;
