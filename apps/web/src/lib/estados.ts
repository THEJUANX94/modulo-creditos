import {
  estadosConObservacion,
  estadosDestino,
  puedeCambiarA,
  puedeTransicionar,
  type Credito,
  type EstadoCredito,
  type EstadoDestino,
  type Rol,
} from '@creditos/shared';

// Textos de los estados y de las acciones que llevan a ellos (ADR 0014). El color y el icono del
// badge están en EstadoBadge.tsx.

export const nombresEstado: Record<EstadoCredito, string> = {
  SOLICITADO: 'Solicitado',
  EN_ESTUDIO: 'En estudio',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
  DESEMBOLSADO: 'Desembolsado',
  CANCELADO: 'Cancelado',
};

export interface AccionEstado {
  destino: EstadoDestino;
  etiqueta: string;
  // Rechazar y cancelar: color de peligro, confirmación y motivo obligatorio (reglas
  // destructive-emphasis y confirmation-dialogs).
  destructiva: boolean;
  pideObservacion: boolean;
}

const etiquetas: Record<EstadoDestino, string> = {
  EN_ESTUDIO: 'Pasar a estudio',
  APROBADO: 'Aprobar',
  RECHAZADO: 'Rechazar',
  DESEMBOLSADO: 'Desembolsar',
  CANCELADO: 'Cancelar crédito',
};

// Solo las transiciones válidas para el estado del crédito y el rol del usuario. Los cuatro ojos
// dependen de quién registró o aprobó, que el cliente no conoce: los decide la API.
export function accionesDisponibles(credito: Credito, rol: Rol): AccionEstado[] {
  if (credito.eliminacion) return [];
  return estadosDestino
    .filter((destino) => puedeTransicionar(credito.estado, destino) && puedeCambiarA(rol, destino))
    .map((destino) => ({
      destino,
      etiqueta: etiquetas[destino],
      destructiva: destino === 'RECHAZADO' || destino === 'CANCELADO',
      pideObservacion: estadosConObservacion.includes(destino),
    }));
}
