import { estadosCredito, type Catalogos, type DetalleError } from '@creditos/shared';
import { AppError } from '../../shared/errores/appError';
import * as catalogosRepository from './catalogosRepository';

export async function obtenerCatalogos(): Promise<Catalogos> {
  return { ...(await catalogosRepository.listarActivos()), estados: [...estadosCredito] };
}

interface CodigosAVerificar {
  tipoCredito?: string;
  formaPago?: string;
  tipoIdentificacionAsociado?: string;
}

// Los catálogos los administra el negocio en la BD: un código tiene que existir y estar activo.
// Un valor retirado (activo = 0) sigue en los créditos viejos, pero no se acepta en uno nuevo.
export async function verificarCodigos(codigos: CodigosAVerificar): Promise<void> {
  const verificaciones: [
    keyof CodigosAVerificar,
    string | undefined,
    (c: string) => Promise<boolean>,
  ][] = [
    ['tipoCredito', codigos.tipoCredito, catalogosRepository.tipoCreditoActivo],
    ['formaPago', codigos.formaPago, catalogosRepository.formaPagoActiva],
    [
      'tipoIdentificacionAsociado',
      codigos.tipoIdentificacionAsociado,
      catalogosRepository.tipoIdentificacionActivo,
    ],
  ];

  const details: DetalleError[] = [];
  for (const [campo, codigo, activo] of verificaciones) {
    if (codigo !== undefined && !(await activo(codigo))) {
      details.push({ campo, mensaje: `${codigo} no existe o no está activo` });
    }
  }
  if (details.length > 0)
    throw new AppError('VALIDACION_FALLIDA', 'Hay campos con errores', details);
}
