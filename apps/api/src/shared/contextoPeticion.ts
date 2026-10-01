import { AsyncLocalStorage } from 'node:async_hooks';

// Datos de la petición en curso, disponibles en cualquier capa sin pasarlos por parámetro.
// El logger los agrega a cada línea (ADR 0010). usuarioId se completa al autenticar.
export interface ContextoPeticion {
  requestId: string;
  usuarioId?: string;
}

export const contextoPeticion = new AsyncLocalStorage<ContextoPeticion>();
