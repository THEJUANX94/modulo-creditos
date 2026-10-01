import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
  esquemaCambiarEstadoUsuario,
  esquemaCambiarRolUsuario,
  esquemaCrearUsuario,
  esquemaPaginacion,
  esquemaUsuario,
} from '@creditos/shared';
import { z } from 'zod';
import {
  cuerpoJson,
  errores,
  erroresAutenticacion,
  respuestaJson,
  seguridadBearer,
  sobreExito,
  sobreLista,
} from '../../docs/ayudasDocs';

const parametrosId = z.object({ id: z.uuid() });

export function registrarDocsUsuarios(registro: OpenAPIRegistry): void {
  const comunes = { tags: ['Usuarios (ADMIN)'], security: seguridadBearer };

  registro.registerPath({
    ...comunes,
    method: 'get',
    path: '/api/usuarios',
    summary: 'Lista los usuarios, ordenados por nombre',
    request: { query: esquemaPaginacion },
    responses: {
      200: respuestaJson('Usuarios', sobreLista(esquemaUsuario)),
      ...errores('VALIDACION_FALLIDA', 'SIN_PERMISO', ...erroresAutenticacion),
    },
  });

  registro.registerPath({
    ...comunes,
    method: 'post',
    path: '/api/usuarios',
    summary: 'Crea un usuario con contraseña temporal',
    description: 'El usuario debe cambiar la contraseña en su primer login.',
    request: { body: cuerpoJson(esquemaCrearUsuario) },
    responses: {
      201: respuestaJson('Creado', sobreExito(esquemaUsuario)),
      ...errores('VALIDACION_FALLIDA', 'SIN_PERMISO', 'CORREO_DUPLICADO', ...erroresAutenticacion),
    },
  });

  registro.registerPath({
    ...comunes,
    method: 'patch',
    path: '/api/usuarios/{id}/estado',
    summary: 'Activa o desactiva un usuario',
    description:
      'Desactivar corta su sesión al instante. Un ADMIN no puede desactivarse a sí mismo.',
    request: { params: parametrosId, body: cuerpoJson(esquemaCambiarEstadoUsuario) },
    responses: {
      200: respuestaJson('Actualizado', sobreExito(esquemaUsuario)),
      ...errores('VALIDACION_FALLIDA', 'SIN_PERMISO', 'USUARIO_NOT_FOUND', ...erroresAutenticacion),
    },
  });

  registro.registerPath({
    ...comunes,
    method: 'patch',
    path: '/api/usuarios/{id}/rol',
    summary: 'Cambia el rol de un usuario',
    description: 'Corta su sesión, para que el token nuevo traiga el rol nuevo.',
    request: { params: parametrosId, body: cuerpoJson(esquemaCambiarRolUsuario) },
    responses: {
      200: respuestaJson('Actualizado', sobreExito(esquemaUsuario)),
      ...errores('VALIDACION_FALLIDA', 'SIN_PERMISO', 'USUARIO_NOT_FOUND', ...erroresAutenticacion),
    },
  });
}
