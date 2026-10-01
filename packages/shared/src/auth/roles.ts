// Mismos códigos que la tabla Roles (003-catalogos.sql).
export const roles = ['ASESOR', 'ANALISTA', 'TESORERIA', 'ADMIN'] as const;

export type Rol = (typeof roles)[number];
