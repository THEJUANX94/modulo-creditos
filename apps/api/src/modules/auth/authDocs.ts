import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
  esquemaCambioContrasena,
  esquemaLogin,
  esquemaRespuestaSesion,
  esquemaUsuarioSesion,
} from '@creditos/shared';
import { z } from 'zod';
import {
  cuerpoJson,
  errores,
  erroresAutenticacion,
  respuestaJson,
  seguridadBearer,
  sobreExito,
} from '../../docs/ayudasDocs';

const cabeceraCsrf = z.object({
  'X-CSRF': z.literal('1').meta({ description: 'Defensa anti-CSRF: siempre "1"' }),
});

const notaCookie =
  'El refresh token viaja en la cookie httpOnly `refreshToken` (Path=/api/auth), no en el cuerpo. ' +
  'Desde Swagger funciona porque se sirve en el mismo origen que la API.';

export function registrarDocsAuth(registro: OpenAPIRegistry): void {
  registro.registerPath({
    method: 'post',
    path: '/api/auth/login',
    tags: ['Autenticación'],
    summary: 'Inicia sesión',
    description:
      `Abre una sesión y cierra la anterior del mismo usuario (sesión única). ${notaCookie} ` +
      'Copie el accessToken en el botón Authorize para probar las rutas protegidas.',
    request: { body: cuerpoJson(esquemaLogin) },
    responses: {
      200: respuestaJson('Sesión abierta', sobreExito(esquemaRespuestaSesion)),
      ...errores('VALIDACION_FALLIDA', 'CREDENCIALES_INVALIDAS', 'DEMASIADAS_SOLICITUDES'),
    },
  });

  registro.registerPath({
    method: 'post',
    path: '/api/auth/refresh',
    tags: ['Autenticación'],
    summary: 'Rota el refresh token y emite un access token nuevo',
    description: notaCookie,
    request: { headers: cabeceraCsrf },
    responses: {
      200: respuestaJson('Tokens nuevos', sobreExito(esquemaRespuestaSesion)),
      ...errores('CSRF_INVALIDO', 'SESION_INVALIDA', 'DEMASIADAS_SOLICITUDES'),
    },
  });

  registro.registerPath({
    method: 'post',
    path: '/api/auth/logout',
    tags: ['Autenticación'],
    summary: 'Cierra la sesión (idempotente)',
    description: notaCookie,
    request: { headers: cabeceraCsrf },
    responses: {
      200: respuestaJson('Sesión cerrada', sobreExito(z.null())),
      ...errores('CSRF_INVALIDO', 'DEMASIADAS_SOLICITUDES'),
    },
  });

  registro.registerPath({
    method: 'post',
    path: '/api/auth/contrasena',
    tags: ['Autenticación'],
    summary: 'Cambia la contraseña y abre una sesión nueva',
    description: 'Disponible aunque la contraseña temporal no se haya cambiado.',
    security: seguridadBearer,
    request: { body: cuerpoJson(esquemaCambioContrasena) },
    responses: {
      200: respuestaJson('Contraseña cambiada', sobreExito(esquemaRespuestaSesion)),
      ...errores('VALIDACION_FALLIDA', ...erroresAutenticacion),
    },
  });

  registro.registerPath({
    method: 'get',
    path: '/api/auth/me',
    tags: ['Autenticación'],
    summary: 'Usuario de la sesión y su rol',
    security: seguridadBearer,
    responses: {
      200: respuestaJson('Usuario', sobreExito(esquemaUsuarioSesion)),
      ...errores(...erroresAutenticacion),
    },
  });
}
