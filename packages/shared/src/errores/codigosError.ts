// Catálogo único de códigos de error. La API los lanza y el frontend decide con ellos qué mostrar.
// Si un código cambia de nombre, falla la compilación en ambos lados.
export const codigosError = {
  VALIDACION_FALLIDA: { status: 400 },
  NO_AUTENTICADO: { status: 401 },
  SIN_PERMISO: { status: 403 },
  CREDITO_NOT_FOUND: { status: 404 },
  RUTA_NO_ENCONTRADA: { status: 404 },
  CREDITO_DUPLICADO: { status: 409 },
  CREDITO_NO_EDITABLE: { status: 409 },
  CREDITO_NO_ELIMINABLE: { status: 409 },
  TRANSICION_INVALIDA: { status: 409 },
  CREDITO_MODIFICADO: { status: 409 },
  CUERPO_DEMASIADO_GRANDE: { status: 413 },
  ASOCIADO_NOMBRE_NO_COINCIDE: { status: 422 },
  ERROR_INTERNO: { status: 500 },
  BD_NO_DISPONIBLE: { status: 503 },
} as const satisfies Record<string, { status: number }>;

export type CodigoError = keyof typeof codigosError;
