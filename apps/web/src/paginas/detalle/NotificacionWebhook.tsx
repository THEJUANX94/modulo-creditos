import { Link } from 'react-router';
import { EstadoEvento } from '@/components/EstadoEvento';
import { Cargando, ErrorCarga } from '@/components/Estados';
import { useEventosWebhook } from '@/lib/consultas';
import { formatearFechaHora } from '@/lib/formatos';

// La notificación credito.creado de este crédito (solo ADMIN, ADR 0018). Mientras está PENDIENTE,
// se vuelve a consultar sola: se ve al worker entregarla o reintentarla.
export function NotificacionWebhook({ creditoId }: { creditoId: string }) {
  const { data, isPending, error, refetch } = useEventosWebhook({ creditoId });
  if (isPending) return <Cargando filas={1} etiqueta="Cargando la notificación…" />;
  if (error) return <ErrorCarga error={error} reintentar={() => void refetch()} />;
  const [evento] = data.datos;
  if (!evento) return <p className="text-muted-foreground">Este crédito no generó notificación.</p>;
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      <div>
        <dt className="text-sm text-muted-foreground">Estado</dt>
        <dd className="mt-1" aria-live="polite">
          <EstadoEvento estado={evento.estado} />
        </dd>
      </div>
      <div>
        <dt className="text-sm text-muted-foreground">Intentos</dt>
        <dd className="mt-1 tabular-nums">{evento.intentos}</dd>
      </div>
      <div>
        <dt className="text-sm text-muted-foreground">
          {evento.fechaEntrega ? 'Entregado' : 'Próximo intento'}
        </dt>
        <dd className="mt-1">
          {evento.fechaEntrega
            ? formatearFechaHora(evento.fechaEntrega)
            : evento.proximoIntento
              ? formatearFechaHora(evento.proximoIntento)
              : '—'}
        </dd>
      </div>
      <div>
        <dt className="text-sm text-muted-foreground">Traza</dt>
        <dd className="mt-1">
          <Link
            to={`/webhook/${evento.eventId}`}
            className="text-enlace underline-offset-4 hover:underline"
          >
            Ver cada intento
          </Link>
        </dd>
      </div>
    </dl>
  );
}
