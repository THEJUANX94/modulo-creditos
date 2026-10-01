import { esquemaRespuestaSesion, type RespuestaSesion, type UsuarioSesion } from '@creditos/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { z } from 'zod';
import {
  fijarToken,
  pedir,
  refrescarSesion,
  registrarCierreSesion,
  type MotivoCierre,
} from './api';

// Sesión en el navegador (ADR 0016, ADR 0021): el access token, solo en memoria; al abrir o
// recargar la página se intenta un refresh con la cookie, y si hay sesión se entra sin login.

export type EstadoSesion =
  | { estado: 'cargando' }
  | { estado: 'anonimo'; aviso?: string }
  | { estado: 'activo'; usuario: UsuarioSesion };

interface ContextoSesion {
  sesion: EstadoSesion;
  iniciarSesion: (correo: string, contrasena: string) => Promise<UsuarioSesion>;
  cambiarContrasena: (contrasenaActual: string, contrasenaNueva: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
}

const Contexto = createContext<ContextoSesion | null>(null);

const avisos: Record<MotivoCierre, string> = {
  SESION_INVALIDA:
    'Su sesión se cerró: se inició sesión con su usuario en otro lugar, o un administrador cambió su cuenta. Inicie sesión de nuevo.',
  SESION_VENCIDA: 'Su sesión venció. Inicie sesión de nuevo.',
};

export function SesionProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<EstadoSesion>({ estado: 'cargando' });
  const queryClient = useQueryClient();

  const abrir = useCallback((respuesta: RespuestaSesion) => {
    fijarToken(respuesta.accessToken);
    setSesion({ estado: 'activo', usuario: respuesta.usuario });
    return respuesta.usuario;
  }, []);

  const terminar = useCallback(
    (aviso?: string) => {
      fijarToken(null);
      queryClient.clear();
      setSesion({ estado: 'anonimo', aviso });
    },
    [queryClient],
  );

  useEffect(() => {
    registrarCierreSesion((motivo) => terminar(avisos[motivo]));
    // Al cargar: ¿hay una sesión viva en la cookie?
    void refrescarSesion().then((respuesta) => {
      if (respuesta) abrir(respuesta);
      else setSesion({ estado: 'anonimo' });
    });
  }, [abrir, terminar]);

  const valor = useMemo<ContextoSesion>(
    () => ({
      sesion,
      iniciarSesion: async (correo, contrasena) =>
        abrir(
          await pedir('/auth/login', esquemaRespuestaSesion, {
            metodo: 'POST',
            cuerpo: { correo, contrasena },
            sinRefresh: true,
          }),
        ),
      cambiarContrasena: async (contrasenaActual, contrasenaNueva) => {
        abrir(
          await pedir('/auth/contrasena', esquemaRespuestaSesion, {
            metodo: 'POST',
            cuerpo: { contrasenaActual, contrasenaNueva },
          }),
        );
      },
      cerrarSesion: async () => {
        try {
          await pedir('/auth/logout', z.null(), {
            metodo: 'POST',
            conCsrf: true,
            sinRefresh: true,
          });
        } finally {
          terminar();
        }
      },
    }),
    [sesion, abrir, terminar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): ContextoSesion {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useSesion debe usarse dentro de SesionProvider');
  return contexto;
}

// Para las pantallas que solo existen con sesión activa.
export function useUsuario(): UsuarioSesion {
  const { sesion } = useSesion();
  if (sesion.estado !== 'activo') throw new Error('useUsuario requiere una sesión activa');
  return sesion.usuario;
}
