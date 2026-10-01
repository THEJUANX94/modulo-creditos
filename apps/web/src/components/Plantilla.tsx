import { puede, type Accion } from '@creditos/shared';
import { Landmark, LogOut, Menu } from 'lucide-react';
import { Suspense, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { cn } from 'cn';
import { Cargando } from '@/components/Estados';
import { SelectorTema } from '@/components/SelectorTema';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { avisarError } from '@/lib/errores';
import { useSesion, useUsuario } from '@/lib/sesion';

// Plantilla de las pantallas con sesión: barra superior con las secciones según el rol (ADR 0021).
// En pantallas pequeñas, las secciones van en un panel lateral que abre el botón de menú.

const secciones: { ruta: string; nombre: string; permiso: Accion }[] = [
  { ruta: '/', nombre: 'Dashboard', permiso: 'verCreditos' },
  { ruta: '/creditos', nombre: 'Créditos', permiso: 'verCreditos' },
  { ruta: '/usuarios', nombre: 'Usuarios', permiso: 'gestionarUsuarios' },
  { ruta: '/webhook', nombre: 'Webhook', permiso: 'verTrazaWebhook' },
];

const nombresRol = {
  ASESOR: 'Asesor',
  ANALISTA: 'Analista',
  TESORERIA: 'Tesorería',
  ADMIN: 'Administrador',
};

function Enlaces({ alNavegar, vertical }: { alNavegar?: () => void; vertical?: boolean }) {
  const usuario = useUsuario();
  return (
    <ul className={cn('flex gap-1', vertical && 'flex-col')}>
      {secciones
        .filter((seccion) => puede(usuario.rol, seccion.permiso))
        .map((seccion) => (
          <li key={seccion.ruta}>
            <NavLink
              to={seccion.ruta}
              end={seccion.ruta === '/'}
              onClick={alNavegar}
              className={({ isActive }) =>
                cn(
                  'flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:min-h-11',
                  isActive && 'bg-accent text-foreground',
                )
              }
            >
              {seccion.nombre}
            </NavLink>
          </li>
        ))}
    </ul>
  );
}

export function Plantilla() {
  const usuario = useUsuario();
  const { cerrarSesion } = useSesion();
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <div className="min-h-dvh">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2"
      >
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-40 border-b bg-card">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 md:px-6">
          <Sheet open={menuAbierto} onOpenChange={setMenuAbierto}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir el menú">
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <SheetTitle>Módulo de Créditos</SheetTitle>
              </SheetHeader>
              <nav aria-label="Secciones" className="px-4">
                <Enlaces vertical alNavegar={() => setMenuAbierto(false)} />
              </nav>
            </SheetContent>
          </Sheet>

          <NavLink to="/" className="flex items-center gap-2 font-semibold">
            <Landmark className="size-5 text-dorado" aria-hidden="true" />
            <span>Módulo de Créditos</span>
          </NavLink>

          <nav aria-label="Secciones" className="hidden md:block">
            <Enlaces />
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <SelectorTema />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="gap-2"
                  aria-label={`Cuenta de ${usuario.nombre}`}
                >
                  <span
                    className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                    aria-hidden="true"
                  >
                    {usuario.nombre.charAt(0)}
                  </span>
                  <span className="hidden text-sm lg:inline">{usuario.nombre}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <span className="block">{usuario.nombre}</span>
                  <span className="block text-sm font-normal text-muted-foreground">
                    {nombresRol[usuario.rol]} · {usuario.correo}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void cerrarSesion().catch(avisarError)}>
                  <LogOut aria-hidden="true" /> Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main id="contenido" className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        {/* La barra queda visible mientras se descarga la pantalla. */}
        <Suspense fallback={<Cargando filas={4} />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
