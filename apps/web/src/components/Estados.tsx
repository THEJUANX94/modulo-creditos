import { CircleAlert, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { describirError } from '@/lib/errores';

// Estados de carga, vacío y error, iguales en todas las pantallas (reglas loading-states,
// empty-states y error-clarity).

export function Cargando({
  filas = 4,
  etiqueta = 'Cargando…',
}: {
  filas?: number;
  etiqueta?: string;
}) {
  return (
    <div role="status" aria-label={etiqueta} className="flex flex-col gap-3">
      {Array.from({ length: filas }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function SinDatos({
  titulo,
  texto,
  accion,
}: {
  titulo: string;
  texto: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      <Inbox className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="font-medium">{titulo}</p>
      <p className="max-w-md text-sm text-muted-foreground">{texto}</p>
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}

export function ErrorCarga({ error, reintentar }: { error: unknown; reintentar?: () => void }) {
  const { titulo, detalle } = describirError(error);
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2 rounded-xl border px-6 py-12 text-center"
    >
      <CircleAlert className="size-8 text-destructive" aria-hidden="true" />
      <p className="font-medium">{titulo}</p>
      {detalle && <p className="text-sm text-muted-foreground">{detalle}</p>}
      {reintentar && (
        <Button variant="outline" className="mt-2" onClick={reintentar}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

export function Encabezado({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descripcion && <p className="mt-1 text-muted-foreground">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  );
}

export function Paginacion({
  pagina,
  totalPaginas,
  total,
  cambiar,
}: {
  pagina: number;
  totalPaginas: number;
  total: number;
  cambiar: (pagina: number) => void;
}) {
  if (total === 0) return null;
  return (
    <nav aria-label="Paginación" className="mt-4 flex items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">
        Página {pagina} de {Math.max(totalPaginas, 1)} · {total} en total
      </p>
      <div className="flex gap-2">
        <Button variant="outline" disabled={pagina <= 1} onClick={() => cambiar(pagina - 1)}>
          Anterior
        </Button>
        <Button
          variant="outline"
          disabled={pagina >= totalPaginas}
          onClick={() => cambiar(pagina + 1)}
        >
          Siguiente
        </Button>
      </div>
    </nav>
  );
}
