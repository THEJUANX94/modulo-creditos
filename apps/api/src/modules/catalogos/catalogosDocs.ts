import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { esquemaCatalogos } from '@creditos/shared';
import {
  errores,
  erroresAutenticacion,
  respuestaJson,
  seguridadBearer,
  sobreExito,
} from '../../docs/ayudasDocs';

export function registrarDocsCatalogos(registro: OpenAPIRegistry): void {
  registro.registerPath({
    method: 'get',
    path: '/api/catalogos',
    tags: ['Catálogos'],
    summary: 'Tipos de crédito, formas de pago y tipos de identificación activos, y los estados',
    security: seguridadBearer,
    responses: {
      200: respuestaJson('Catálogos', sobreExito(esquemaCatalogos)),
      ...errores('SIN_PERMISO', ...erroresAutenticacion),
    },
  });
}
