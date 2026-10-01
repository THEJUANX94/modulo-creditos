import type { EstadoCredito } from '../creditos/estadosCredito';
import type { Rol } from './roles';

// Matriz de permisos (ADR 0016). La API la hace cumplir; el frontend la usa para mostrar u ocultar acciones.
const todos: readonly Rol[] = ['ASESOR', 'ANALISTA', 'TESORERIA', 'ADMIN'];

export const permisos = {
  verCreditos: todos,
  crearCredito: ['ASESOR', 'ADMIN'],
  editarCredito: ['ASESOR', 'ADMIN'],
  eliminarCredito: ['ASESOR', 'ADMIN'],
  verTrazaWebhook: ['ADMIN'],
  gestionarUsuarios: ['ADMIN'],
} as const satisfies Record<string, readonly Rol[]>;

export type Accion = keyof typeof permisos;

// Quién puede llevar un crédito a cada estado. Las reglas de "cuatro ojos" (quien registra no
// aprueba; quien aprueba no desembolsa) dependen del crédito concreto y las aplica el service.
export const rolesPorEstadoDestino = {
  EN_ESTUDIO: ['ANALISTA', 'ADMIN'],
  APROBADO: ['ANALISTA', 'ADMIN'],
  RECHAZADO: ['ANALISTA', 'ADMIN'],
  DESEMBOLSADO: ['TESORERIA', 'ADMIN'],
  CANCELADO: ['ASESOR', 'ANALISTA', 'ADMIN'],
} as const satisfies Record<Exclude<EstadoCredito, 'SOLICITADO'>, readonly Rol[]>;

export function puede(rol: Rol, accion: Accion): boolean {
  return (permisos[accion] as readonly Rol[]).includes(rol);
}

export function puedeCambiarA(rol: Rol, estado: Exclude<EstadoCredito, 'SOLICITADO'>): boolean {
  return (rolesPorEstadoDestino[estado] as readonly Rol[]).includes(rol);
}
