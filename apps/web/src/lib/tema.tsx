import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// Tema claro u oscuro (ADR 0011): la primera vez se sigue el sistema; si el usuario elige, se
// recuerda en el navegador. index.html aplica la clase antes de pintar, para que no parpadee.

export type Tema = 'light' | 'dark' | 'system';
const clave = 'tema';

interface ContextoTema {
  tema: Tema;
  temaAplicado: 'light' | 'dark';
  setTema: (tema: Tema) => void;
}

const Contexto = createContext<ContextoTema | null>(null);
const consultaOscuro = '(prefers-color-scheme: dark)';

function leerGuardado(): Tema {
  try {
    const valor = localStorage.getItem(clave);
    return valor === 'light' || valor === 'dark' ? valor : 'system';
  } catch {
    return 'system';
  }
}

export function ProveedorTema({ children }: { children: ReactNode }) {
  const [tema, setTemaEstado] = useState<Tema>(leerGuardado);
  const [sistemaOscuro, setSistemaOscuro] = useState(() => matchMedia(consultaOscuro).matches);

  useEffect(() => {
    const consulta = matchMedia(consultaOscuro);
    const alCambiar = () => setSistemaOscuro(consulta.matches);
    consulta.addEventListener('change', alCambiar);
    return () => consulta.removeEventListener('change', alCambiar);
  }, []);

  const temaAplicado = tema === 'system' ? (sistemaOscuro ? 'dark' : 'light') : tema;
  useEffect(() => {
    document.documentElement.classList.toggle('dark', temaAplicado === 'dark');
    document.documentElement.style.colorScheme = temaAplicado;
  }, [temaAplicado]);

  const valor = useMemo<ContextoTema>(
    () => ({
      tema,
      temaAplicado,
      setTema: (nuevo) => {
        setTemaEstado(nuevo);
        try {
          if (nuevo === 'system') localStorage.removeItem(clave);
          else localStorage.setItem(clave, nuevo);
        } catch {
          // Sin almacenamiento (navegación privada): el tema dura lo que dure la pestaña.
        }
      },
    }),
    [tema, temaAplicado],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTema(): ContextoTema {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useTema debe usarse dentro de ProveedorTema');
  return contexto;
}
