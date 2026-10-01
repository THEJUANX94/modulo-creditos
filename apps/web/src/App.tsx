import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { Cargando } from '@/components/Estados';
import { Plantilla } from '@/components/Plantilla';
import { RutaProtegida } from '@/components/RutaProtegida';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorApi } from '@/lib/api';
import { SesionProvider } from '@/lib/sesion';
import { ProveedorTema } from '@/lib/tema';
import { Login } from '@/paginas/Login';

// Cada pantalla se descarga al entrar a ella (regla de rendimiento de la skill): Recharts, por
// ejemplo, solo se baja con el dashboard.
const CambiarContrasena = lazy(() =>
  import('@/paginas/CambiarContrasena').then((m) => ({ default: m.CambiarContrasena })),
);
const Dashboard = lazy(() => import('@/paginas/Dashboard').then((m) => ({ default: m.Dashboard })));
const ListadoCreditos = lazy(() =>
  import('@/paginas/ListadoCreditos').then((m) => ({ default: m.ListadoCreditos })),
);
const CrearCredito = lazy(() =>
  import('@/paginas/CrearCredito').then((m) => ({ default: m.CrearCredito })),
);
const DetalleCredito = lazy(() =>
  import('@/paginas/detalle/DetalleCredito').then((m) => ({ default: m.DetalleCredito })),
);
const Usuarios = lazy(() => import('@/paginas/Usuarios').then((m) => ({ default: m.Usuarios })));
const TrazaWebhook = lazy(() =>
  import('@/paginas/Webhook').then((m) => ({ default: m.TrazaWebhook })),
);
const EventoWebhook = lazy(() =>
  import('@/paginas/Webhook').then((m) => ({ default: m.EventoWebhook })),
);

// Los errores de la API (4xx) no se reintentan: repetir un 404 o un 403 no los arregla.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (intentos, error) =>
        !(error instanceof ErrorApi && error.status >= 400 && error.status < 500) && intentos < 2,
      refetchOnWindowFocus: false,
    },
  },
});

function NoEncontrada() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-xl font-semibold">Esta página no existe</h1>
      <Button asChild variant="outline">
        <Link to="/">Ir al dashboard</Link>
      </Button>
    </div>
  );
}

export function App() {
  return (
    <ProveedorTema>
      <QueryClientProvider client={queryClient}>
        <SesionProvider>
          <TooltipProvider>
            <BrowserRouter>
              <Suspense fallback={<Cargando filas={3} />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route
                    path="/cambiar-contrasena"
                    element={
                      <RutaProtegida>
                        <CambiarContrasena />
                      </RutaProtegida>
                    }
                  />
                  <Route
                    element={
                      <RutaProtegida>
                        <Plantilla />
                      </RutaProtegida>
                    }
                  >
                    <Route index element={<Dashboard />} />
                    <Route path="creditos" element={<ListadoCreditos />} />
                    <Route
                      path="creditos/nuevo"
                      element={
                        <RutaProtegida permiso="crearCredito">
                          <CrearCredito />
                        </RutaProtegida>
                      }
                    />
                    <Route path="creditos/:id" element={<DetalleCredito />} />
                    <Route
                      path="usuarios"
                      element={
                        <RutaProtegida permiso="gestionarUsuarios">
                          <Usuarios />
                        </RutaProtegida>
                      }
                    />
                    <Route
                      path="webhook"
                      element={
                        <RutaProtegida permiso="verTrazaWebhook">
                          <TrazaWebhook />
                        </RutaProtegida>
                      }
                    />
                    <Route
                      path="webhook/:eventId"
                      element={
                        <RutaProtegida permiso="verTrazaWebhook">
                          <EventoWebhook />
                        </RutaProtegida>
                      }
                    />
                    <Route path="*" element={<NoEncontrada />} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
            <Toaster position="top-right" closeButton duration={5000} />
          </TooltipProvider>
        </SesionProvider>
      </QueryClientProvider>
    </ProveedorTema>
  );
}
