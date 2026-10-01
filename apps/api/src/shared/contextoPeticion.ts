import { AsyncLocalStorage } from 'node:async_hooks';

// Datos de la petición en curso, disponibles en cualquier capa sin pasarlos por parámetro.
// El logger los agrega a cada línea (ADR 0010).
export interface ContextoPeticion {
  requestId: string;
}

export const contextoPeticion = new AsyncLocalStorage<ContextoPeticion>();
