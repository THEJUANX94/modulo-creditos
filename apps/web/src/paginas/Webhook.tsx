import { estadosEventoWebhook, type EstadoEventoWebhook } from '@creditos/shared';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { EstadoEvento, nombresResultado } from '@/components/EstadoEvento';
import { Cargando, Encabezado, ErrorCarga, Paginacion, SinDatos } from '@/components/Estados';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useEventoWebhook, useEventosWebhook } from '@/lib/consultas';
import { formatearFechaHora } from '@/lib/formatos';

// Traza del webhook, solo ADMIN (ADR 0018): cada notificación credito.creado y cada intento de
// envío, con su resultado. Los pendientes se vuelven a consultar solos.

const nombresEstadoEvento: Record<EstadoEventoWebhook, string> = {
  PENDIENTE: 'Pendiente',
  ENTREGADO: 'Entregado',
  FALLIDO: 'Fallido',
};
const todos = 'todos';

export function TrazaWebhook() {
  const [estado, setEstado] = useState<string>(todos);
  const [pagina, setPagina] = useState(1);
  const { data, isPending, error, refetch } = useEventosWebhook({
    pagina,
    tamanoPagina: 20,
    estado: estado === todos ? undefined : estado,
  });

  return (
    <>
      <Encabezado
        titulo="Webhook"
        descripcion="Notificaciones credito.creado enviadas al sistema externo, lo más reciente primero."
      />
      <div className="mb-4 flex max-w-xs flex-col gap-1.5">
        <Label htmlFor="filtro-evento">Estado</Label>
        <Select
          value={estado}
          onValueChange={(valor) => {
            setEstado(valor);
            setPagina(1);
          }}
        >
          <SelectTrigger id="filtro-evento" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={todos}>Todos</SelectItem>
            {estadosEventoWebhook.map((valor) => (
              <SelectItem key={valor} value={valor}>
                {nombresEstadoEvento[valor]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isPending ? (
        <Cargando filas={5} etiqueta="Cargando la traza…" />
      ) : error ? (
        <ErrorCarga error={error} reintentar={() => void refetch()} />
      ) : data.datos.length === 0 ? (
        <SinDatos
          titulo="Sin notificaciones"
          texto="Cada crédito creado genera una notificación al sistema externo."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Crédito</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Intentos</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead>Entregado / próximo intento</TableHead>
                  <TableHead>
                    <span className="sr-only">Detalle</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.datos.map((evento) => (
                  <TableRow key={evento.eventId}>
                    <TableCell>
                      <Link
                        to={`/creditos/${evento.creditoId}`}
                        className="font-medium text-enlace underline-offset-4 hover:underline"
                      >
                        {evento.numeroCredito}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <EstadoEvento estado={evento.estado} />
                    </TableCell>
                    <TableCell className="text-right">{evento.intentos}</TableCell>
                    <TableCell>{formatearFechaHora(evento.fechaCreacion)}</TableCell>
                    <TableCell>
                      {evento.fechaEntrega
                        ? formatearFechaHora(evento.fechaEntrega)
                        : evento.proximoIntento
                          ? formatearFechaHora(evento.proximoIntento)
                          : '—'}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/webhook/${evento.eventId}`}
                        className="text-enlace underline-offset-4 hover:underline"
                      >
                        Ver traza<span className="sr-only"> de {evento.numeroCredito}</span>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Paginacion
            pagina={data.meta.pagina}
            totalPaginas={data.meta.totalPaginas}
            total={data.meta.total}
            cambiar={setPagina}
          />
        </>
      )}
    </>
  );
}

export function EventoWebhook() {
  const { eventId = '' } = useParams();
  const { data: evento, isPending, error, refetch } = useEventoWebhook(eventId);

  return (
    <>
      <Button asChild variant="ghost" className="-ml-3 mb-2">
        <Link to="/webhook">
          <ArrowLeft aria-hidden="true" /> Webhook
        </Link>
      </Button>
      {isPending ? (
        <Cargando filas={4} etiqueta="Cargando el evento…" />
      ) : error ? (
        <ErrorCarga error={error} reintentar={() => void refetch()} />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              Notificación de {evento.numeroCredito}
            </h1>
            <EstadoEvento estado={evento.estado} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 className="text-lg">Intentos de envío</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {evento.traza.length === 0 ? (
                  <p className="text-muted-foreground">Todavía no se ha intentado enviar.</p>
                ) : (
                  <ol className="flex flex-col gap-4">
                    {evento.traza.map((intento) => (
                      <li key={intento.numeroIntento} className="rounded-lg border p-3">
                        <p className="font-medium">
                          Intento {intento.numeroIntento}: {nombresResultado[intento.resultado]}
                          {intento.statusHttp !== null && ` (${intento.statusHttp})`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatearFechaHora(intento.fecha)}
                          {intento.duracionMs !== null && ` · ${intento.duracionMs} ms`}
                        </p>
                        {intento.error && (
                          <p className="mt-1 text-sm break-words">{intento.error}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 className="text-lg">Lo que se envió</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <dl className="grid gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">eventId (webhook-id)</dt>
                    <dd className="font-mono break-all">{evento.eventId}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">requestId</dt>
                    <dd className="font-mono break-all">{evento.requestId ?? '—'}</dd>
                  </div>
                </dl>
                <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-sm">
                  <code>{JSON.stringify(evento.payload, null, 2)}</code>
                </pre>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
