// Mismos valores que CK_Creditos_estado (002-esquema.sql). Reglas en el ADR 0014.
export const estadosCredito = [
  'SOLICITADO',
  'EN_ESTUDIO',
  'APROBADO',
  'RECHAZADO',
  'DESEMBOLSADO',
  'CANCELADO',
] as const;

export type EstadoCredito = (typeof estadosCredito)[number];

// Todo estado salvo el inicial puede ser destino de un cambio de estado.
export const estadosDestino = [
  'EN_ESTUDIO',
  'APROBADO',
  'RECHAZADO',
  'DESEMBOLSADO',
  'CANCELADO',
] as const satisfies readonly EstadoCredito[];

export type EstadoDestino = (typeof estadosDestino)[number];

// Flujo lineal estricto con rechazo directo desde SOLICITADO (ADR 0014). Vive aquí, y no solo en
// la API, para que el frontend muestre únicamente las acciones válidas.
export const transicionesPermitidas = {
  SOLICITADO: ['EN_ESTUDIO', 'RECHAZADO', 'CANCELADO'],
  EN_ESTUDIO: ['APROBADO', 'RECHAZADO', 'CANCELADO'],
  APROBADO: ['DESEMBOLSADO', 'CANCELADO'],
  RECHAZADO: [],
  DESEMBOLSADO: [],
  CANCELADO: [],
} as const satisfies Record<EstadoCredito, readonly EstadoDestino[]>;

export function puedeTransicionar(desde: EstadoCredito, hacia: EstadoDestino): boolean {
  return (transicionesPermitidas[desde] as readonly EstadoDestino[]).includes(hacia);
}

// En curso: cuentan para la regla de duplicados (UX_Creditos_enCurso).
export const estadosEnCurso = ['SOLICITADO', 'EN_ESTUDIO', 'APROBADO'] as const;

// Exigen observación (el motivo), como CK_HistorialCredito_observacion.
export const estadosConObservacion: readonly EstadoDestino[] = ['RECHAZADO', 'CANCELADO'];
