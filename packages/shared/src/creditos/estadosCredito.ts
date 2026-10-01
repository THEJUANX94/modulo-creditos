// Mismos valores que CK_Creditos_estado (002-esquema.sql). Las transiciones están en el ADR 0014.
export const estadosCredito = [
  'SOLICITADO',
  'EN_ESTUDIO',
  'APROBADO',
  'RECHAZADO',
  'DESEMBOLSADO',
  'CANCELADO',
] as const;

export type EstadoCredito = (typeof estadosCredito)[number];
