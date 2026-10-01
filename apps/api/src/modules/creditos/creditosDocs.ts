import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
  esquemaCambiarEstado,
  esquemaCredito,
  esquemaCrearCredito,
  esquemaEditarCredito,
  esquemaEliminarCredito,
  esquemaEntradaHistorial,
  esquemaFiltrosCreditos,
  esquemaResumenCreditos,
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
import { esquemaIdCredito } from './creditosController';

export function registrarDocsCreditos(registro: OpenAPIRegistry): void {
  const comunes = { tags: ['Créditos'], security: seguridadBearer };

  registro.registerPath({
    ...comunes,
    method: 'get',
    path: '/api/creditos',
    summary: 'Lista créditos con paginación, filtros, búsqueda y orden',
    description: 'Los eliminados no aparecen salvo con incluirEliminados=true (solo ADMIN).',
    request: { query: esquemaFiltrosCreditos },
    responses: {
      200: respuestaJson('Créditos', sobreLista(esquemaCredito)),
      ...errores('VALIDACION_FALLIDA', 'SIN_PERMISO', ...erroresAutenticacion),
    },
  });

  registro.registerPath({
    ...comunes,
    method: 'get',
    path: '/api/creditos/resumen',
    summary: 'Totales para el dashboard: cantidad y monto por estado',
    responses: {
      200: respuestaJson('Resumen', sobreExito(esquemaResumenCreditos)),
      ...errores('SIN_PERMISO', ...erroresAutenticacion),
    },
  });

  registro.registerPath({
    ...comunes,
    method: 'get',
    path: '/api/creditos/{id}',
    summary: 'Detalle del crédito, con la version para modificarlo',
    request: { params: esquemaIdCredito },
    responses: {
      200: respuestaJson('Crédito', sobreExito(esquemaCredito)),
      ...errores('VALIDACION_FALLIDA', 'SIN_PERMISO', 'CREDITO_NOT_FOUND', ...erroresAutenticacion),
    },
  });

  registro.registerPath({
    ...comunes,
    method: 'get',
    path: '/api/creditos/{id}/historial',
    summary:
      'Línea de tiempo: cambios de estado, ediciones y eliminación (lo más reciente primero)',
    request: { params: esquemaIdCredito },
    responses: {
      200: respuestaJson('Historial', sobreExito(z.array(esquemaEntradaHistorial))),
      ...errores('VALIDACION_FALLIDA', 'SIN_PERMISO', 'CREDITO_NOT_FOUND', ...erroresAutenticacion),
    },
  });

  registro.registerPath({
    ...comunes,
    method: 'post',
    path: '/api/creditos',
    summary: 'Crea un crédito en SOLICITADO',
    description:
      'Si el asociado no existe, lo crea; si existe con otro nombre, responde 422. ' +
      'Un solo crédito en curso por asociado y tipo.',
    request: { body: cuerpoJson(esquemaCrearCredito) },
    responses: {
      201: respuestaJson('Creado (header Location con su URL)', sobreExito(esquemaCredito)),
      ...errores(
        'VALIDACION_FALLIDA',
        'SIN_PERMISO',
        'CREDITO_DUPLICADO',
        'ASOCIADO_NOMBRE_NO_COINCIDE',
        ...erroresAutenticacion,
      ),
    },
  });

  registro.registerPath({
    ...comunes,
    method: 'patch',
    path: '/api/creditos/{id}',
    summary: 'Edita las condiciones (solo en SOLICITADO)',
    description: 'Solo cambian los campos enviados. Exige la version vigente.',
    request: { params: esquemaIdCredito, body: cuerpoJson(esquemaEditarCredito) },
    responses: {
      200: respuestaJson('Actualizado', sobreExito(esquemaCredito)),
      ...errores(
        'VALIDACION_FALLIDA',
        'SIN_PERMISO',
        'CREDITO_NOT_FOUND',
        'CREDITO_NO_EDITABLE',
        'CREDITO_DUPLICADO',
        'CREDITO_MODIFICADO',
        ...erroresAutenticacion,
      ),
    },
  });

  registro.registerPath({
    ...comunes,
    method: 'patch',
    path: '/api/creditos/{id}/estado',
    summary: 'Cambia el estado',
    description:
      'Verifica, en orden: rol, transición permitida, cuatro ojos (quien registra no aprueba; ' +
      'quien aprueba no desembolsa) y version.',
    request: { params: esquemaIdCredito, body: cuerpoJson(esquemaCambiarEstado) },
    responses: {
      200: respuestaJson('Estado cambiado', sobreExito(esquemaCredito)),
      ...errores(
        'VALIDACION_FALLIDA',
        'SIN_PERMISO',
        'CREDITO_NOT_FOUND',
        'TRANSICION_INVALIDA',
        'CREDITO_MODIFICADO',
        ...erroresAutenticacion,
      ),
    },
  });

  registro.registerPath({
    ...comunes,
    method: 'delete',
    path: '/api/creditos/{id}',
    summary: 'Borrado lógico (solo en SOLICITADO)',
    description: 'Exige un motivo y la version vigente. Después de SOLICITADO, use la cancelación.',
    request: { params: esquemaIdCredito, body: cuerpoJson(esquemaEliminarCredito) },
    responses: {
      200: respuestaJson('Eliminado', sobreExito(z.null())),
      ...errores(
        'VALIDACION_FALLIDA',
        'SIN_PERMISO',
        'CREDITO_NOT_FOUND',
        'CREDITO_NO_ELIMINABLE',
        'CREDITO_MODIFICADO',
        ...erroresAutenticacion,
      ),
    },
  });
}
