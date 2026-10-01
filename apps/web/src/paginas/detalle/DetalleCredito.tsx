import { puede } from '@creditos/shared';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { EstadoBadge } from '@/components/EstadoBadge';
import { Cargando, ErrorCarga } from '@/components/Estados';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorApi } from '@/lib/api';
import { useCatalogos, useCredito } from '@/lib/consultas';
import { formatearFechaHora, formatearMonto, formatearTasa } from '@/lib/formatos';
import { useUsuario } from '@/lib/sesion';
import { AccionesCredito } from './AccionesCredito';
import { Historial } from './Historial';
import { NotificacionWebhook } from './NotificacionWebhook';

// Detalle (enunciado: información del crédito y su historial), con las acciones que permiten su
// estado y el rol del usuario.

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

export function DetalleCredito() {
  const { id = '' } = useParams();
  const usuario = useUsuario();
  const { data: credito, isPending, error, refetch } = useCredito(id);
  const { data: catalogos } = useCatalogos();

  const volver = (
    <Button asChild variant="ghost" className="-ml-3 mb-2">
      <Link to="/creditos">
        <ArrowLeft aria-hidden="true" /> Créditos
      </Link>
    </Button>
  );

  if (isPending) return <Cargando filas={5} etiqueta="Cargando el crédito…" />;
  if (error) {
    const noExiste =
      error instanceof ErrorApi &&
      (error.codigo === 'CREDITO_NOT_FOUND' || error.codigo === 'VALIDACION_FALLIDA');
    return (
      <>
        {volver}
        <ErrorCarga
          error={
            noExiste
              ? new ErrorApi(404, 'CREDITO_NOT_FOUND', 'El crédito no existe o fue eliminado.')
              : error
          }
          reintentar={noExiste ? undefined : () => void refetch()}
        />
      </>
    );
  }

  const nombreDe = (lista: { codigo: string; nombre: string }[] | undefined, codigo: string) =>
    lista?.find((item) => item.codigo === codigo)?.nombre ?? codigo;

  return (
    <>
      {volver}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Crédito {credito.numeroCredito}</h1>
          <EstadoBadge estado={credito.estado} />
        </div>
        {credito.eliminacion && (
          <div
            role="status"
            className="flex gap-2 rounded-lg border border-destructive px-3 py-2 text-sm"
          >
            <Trash2 className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            <span>
              Eliminado por {credito.eliminacion.usuarioNombre} el{' '}
              {formatearFechaHora(credito.eliminacion.fecha)}
              {credito.eliminacion.motivo && `: “${credito.eliminacion.motivo}”`}
            </span>
          </div>
        )}
        <AccionesCredito credito={credito} recargar={() => void refetch()} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-6 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2 className="text-lg">Solicitud</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Dato etiqueta="Asociado">{credito.nombreAsociado}</Dato>
                <Dato etiqueta="Identificación">
                  {nombreDe(catalogos?.tiposIdentificacion, credito.tipoIdentificacionAsociado)}{' '}
                  {credito.identificacionAsociado}
                </Dato>
                <Dato etiqueta="Tipo de crédito">
                  {nombreDe(catalogos?.tiposCredito, credito.tipoCredito)}
                </Dato>
                <Dato etiqueta="Forma de pago">
                  {nombreDe(catalogos?.formasPago, credito.formaPago)}
                </Dato>
                <Dato etiqueta="Valor solicitado">
                  <span className="text-lg font-semibold tabular-nums">
                    {formatearMonto(credito.valorSolicitado)}
                  </span>
                </Dato>
                <Dato etiqueta="Tasa de interés">{formatearTasa(credito.tasaInteres)}</Dato>
                <Dato etiqueta="Número de cuotas">{credito.numeroCuotas} mensuales</Dato>
                <Dato etiqueta="Fecha de solicitud">
                  {formatearFechaHora(credito.fechaSolicitud)}
                </Dato>
                <Dato etiqueta="Última actualización">
                  {formatearFechaHora(credito.fechaActualizacion)}
                </Dato>
              </dl>
            </CardContent>
          </Card>
          {puede(usuario.rol, 'verTrazaWebhook') && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 className="text-lg">Notificación al sistema externo</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <NotificacionWebhook creditoId={credito.id} />
              </CardContent>
            </Card>
          )}
        </div>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              <h2 className="text-lg">Historial</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Historial creditoId={credito.id} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
