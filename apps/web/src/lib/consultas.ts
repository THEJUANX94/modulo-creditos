import {
  esquemaCatalogos,
  esquemaCredito,
  esquemaDetalleEventoWebhook,
  esquemaEntradaHistorial,
  esquemaEventoWebhook,
  esquemaResumenCreditos,
  esquemaUsuario,
  type Credito,
  type FiltrosCreditos,
} from '@creditos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { consulta, pedir, pedirLista } from './api';

// Consultas y cambios contra la API (ADR 0021). Cada clave incluye todo lo que cambia la respuesta,
// y cada cambio invalida lo que deja desactualizado: crear o cambiar un crédito refresca el
// listado, el detalle, el historial, el resumen y la traza del webhook.

export const claves = {
  catalogos: ['catalogos'] as const,
  resumen: ['creditos', 'resumen'] as const,
  creditos: (filtros: Partial<FiltrosCreditos>) => ['creditos', 'lista', filtros] as const,
  credito: (id: string) => ['creditos', 'detalle', id] as const,
  historial: (id: string) => ['creditos', 'historial', id] as const,
  usuarios: (pagina: number) => ['usuarios', pagina] as const,
  eventos: (filtros: Record<string, string | number | undefined>) =>
    ['webhooks', 'lista', filtros] as const,
  evento: (eventId: string) => ['webhooks', 'detalle', eventId] as const,
};

// Los catálogos cambian poco: se piden una vez por sesión.
export const useCatalogos = () =>
  useQuery({
    queryKey: claves.catalogos,
    queryFn: () => pedir('/catalogos', esquemaCatalogos),
    staleTime: Infinity,
  });

export const useResumen = () =>
  useQuery({
    queryKey: claves.resumen,
    queryFn: () => pedir('/creditos/resumen', esquemaResumenCreditos),
  });

export const useCreditos = (filtros: Partial<FiltrosCreditos>) =>
  useQuery({
    queryKey: claves.creditos(filtros),
    queryFn: () =>
      pedirLista(
        `/creditos${consulta({ ...filtros, estado: filtros.estado?.join(',') })}`,
        esquemaCredito,
      ),
    // Al cambiar de página o de filtro, la tabla anterior queda visible mientras llega la nueva.
    placeholderData: keepPreviousData,
  });

export const useCredito = (id: string) =>
  useQuery({
    queryKey: claves.credito(id),
    queryFn: () => pedir(`/creditos/${id}`, esquemaCredito),
  });

export const useHistorial = (id: string) =>
  useQuery({
    queryKey: claves.historial(id),
    queryFn: () => pedir(`/creditos/${id}/historial`, z.array(esquemaEntradaHistorial)),
  });

export const useUsuarios = (pagina: number) =>
  useQuery({
    queryKey: claves.usuarios(pagina),
    queryFn: () => pedirLista(`/usuarios${consulta({ pagina, tamanoPagina: 20 })}`, esquemaUsuario),
    placeholderData: keepPreviousData,
  });

export const useEventosWebhook = (
  filtros: Record<string, string | number | undefined>,
  activa = true,
) =>
  useQuery({
    queryKey: claves.eventos(filtros),
    queryFn: () => pedirLista(`/webhooks/eventos${consulta(filtros)}`, esquemaEventoWebhook),
    placeholderData: keepPreviousData,
    enabled: activa,
    // Un evento PENDIENTE cambia solo (lo envía el worker): se vuelve a consultar cada 5 s.
    refetchInterval: (query) =>
      query.state.data?.datos.some((evento) => evento.estado === 'PENDIENTE') ? 5000 : false,
  });

export const useEventoWebhook = (eventId: string) =>
  useQuery({
    queryKey: claves.evento(eventId),
    queryFn: () => pedir(`/webhooks/eventos/${eventId}`, esquemaDetalleEventoWebhook),
    refetchInterval: (query) => (query.state.data?.estado === 'PENDIENTE' ? 5000 : false),
  });

// ───────────── Cambios ─────────────

function useInvalidarCreditos() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['creditos'] }),
      queryClient.invalidateQueries({ queryKey: ['webhooks'] }),
    ]);
  };
}

export function useCrearCredito() {
  const invalidar = useInvalidarCreditos();
  return useMutation({
    mutationFn: (datos: Record<string, unknown>) =>
      pedir('/creditos', esquemaCredito, { metodo: 'POST', cuerpo: datos }),
    onSuccess: invalidar,
  });
}

export function useEditarCredito(credito: Credito) {
  const invalidar = useInvalidarCreditos();
  return useMutation({
    mutationFn: (cambios: Record<string, unknown>) =>
      pedir(`/creditos/${credito.id}`, esquemaCredito, {
        metodo: 'PATCH',
        cuerpo: { ...cambios, version: credito.version },
      }),
    onSuccess: invalidar,
  });
}

export function useCambiarEstado(credito: Credito) {
  const invalidar = useInvalidarCreditos();
  return useMutation({
    mutationFn: (datos: { estado: string; observacion?: string }) =>
      pedir(`/creditos/${credito.id}/estado`, esquemaCredito, {
        metodo: 'PATCH',
        cuerpo: { ...datos, version: credito.version },
      }),
    onSuccess: invalidar,
  });
}

export function useEliminarCredito(credito: Credito) {
  const invalidar = useInvalidarCreditos();
  return useMutation({
    mutationFn: (motivo: string) =>
      pedir(`/creditos/${credito.id}`, z.null(), {
        metodo: 'DELETE',
        cuerpo: { motivo, version: credito.version },
      }),
    onSuccess: invalidar,
  });
}

function useInvalidarUsuarios() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['usuarios'] });
}

export function useCrearUsuario() {
  const invalidar = useInvalidarUsuarios();
  return useMutation({
    mutationFn: (datos: Record<string, unknown>) =>
      pedir('/usuarios', esquemaUsuario, { metodo: 'POST', cuerpo: datos }),
    onSuccess: invalidar,
  });
}

export function useCambiarUsuario() {
  const invalidar = useInvalidarUsuarios();
  return useMutation({
    mutationFn: ({ id, ...cambio }: { id: string; activo?: boolean; rol?: string }) =>
      'rol' in cambio && cambio.rol
        ? pedir(`/usuarios/${id}/rol`, esquemaUsuario, {
            metodo: 'PATCH',
            cuerpo: { rol: cambio.rol },
          })
        : pedir(`/usuarios/${id}/estado`, esquemaUsuario, {
            metodo: 'PATCH',
            cuerpo: { activo: cambio.activo },
          }),
    onSuccess: invalidar,
  });
}
