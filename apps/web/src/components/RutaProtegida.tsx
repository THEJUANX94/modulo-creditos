import { puede, type Accion } from '@creditos/shared';
import { ShieldX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { Cargando } from '@/components/Estados';
import { Button } from '@/components/ui/button';
import { useSesion } from '@/lib/sesion';

// Sin sesión, al login (y de vuelta a donde iba). Con la contraseña temporal pendiente, solo se
// puede cambiar la contraseña: la API responde 403 a todo lo demás. Sin el permiso de la sección,
// un aviso en vez de una pantalla rota.
export function RutaProtegida({ children, permiso }: { children: ReactNode; permiso?: Accion }) {
  const { sesion } = useSesion();
  const ubicacion = useLocation();

  if (sesion.estado === 'cargando') {
    return (
      <div className="mx-auto max-w-md p-8">
        <Cargando filas={3} etiqueta="Recuperando la sesión…" />
      </div>
    );
  }
  if (sesion.estado === 'anonimo') {
    return (
      <Navigate to="/login" replace state={{ desde: ubicacion.pathname + ubicacion.search }} />
    );
  }
  if (sesion.usuario.debeCambiarContrasena && ubicacion.pathname !== '/cambiar-contrasena') {
    return <Navigate to="/cambiar-contrasena" replace />;
  }
  if (permiso && !puede(sesion.usuario.rol, permiso)) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <ShieldX className="size-10 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-xl font-semibold">No tiene permiso para ver esta sección</h1>
        <p className="text-muted-foreground">
          Si cree que es un error, consulte con un administrador.
        </p>
        <Button asChild variant="outline">
          <Link to="/">Ir al dashboard</Link>
        </Button>
      </div>
    );
  }
  return children;
}
