import { codigosError, type CodigoError, type DetalleError } from '@creditos/shared';

// Error esperado de la aplicación: el errorHandler lo traduce al formato de error del enunciado,
// con el status que corresponde a su código.
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: CodigoError,
    message: string,
    readonly details?: DetalleError[],
  ) {
    super(message);
    this.name = 'AppError';
    this.status = codigosError[code].status;
  }
}
