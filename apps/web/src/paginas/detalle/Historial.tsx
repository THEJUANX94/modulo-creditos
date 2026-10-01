import type { EntradaHistorial } from '@creditos/shared';
import { ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { EstadoBadge } from '@/components/EstadoBadge';
import { Cargando, ErrorCarga, SinDatos } from '@/components/Estados';
import { useHistorial } from '@/lib/consultas';
import { formatearFechaHora, formatearMonto, formatearTasa } from '@/lib/formatos';

// Historial del crédito, de lo más reciente a lo más antiguo (ADR 0017): cambios de estado,
// ediciones agrupadas con sus campos y la eliminación, cada uno con quién y cuándo.

const nombresCampo: Record<string, string> = {
  tipoCredito: 'Tipo de crédito',
  valorSolicitado: 'Valor solicitado',
  tasaInteres: 'Tasa de interés',
  numeroCuotas: 'Número de cuotas',
  formaPago: 'Forma de pago',
};

function valorLegible(campo: string, valor: string | null): string {
  if (valor === null) return '—';
  if (campo === 'valorSolicitado') return formatearMonto(valor);
  if (campo === 'tasaInteres') return formatearTasa(valor);
  return valor;
}

function Entrada({ entrada }: { entrada: EntradaHistorial }) {
  const pie = (
    <p className="text-sm text-muted-foreground">
      {entrada.usuario.nombre} ·{' '}
      <time dateTime={entrada.fecha}>{formatearFechaHora(entrada.fecha)}</time>
    </p>
  );

  if (entrada.tipo === 'ESTADO') {
    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          {entrada.estadoAnterior ? (
            <>
              <EstadoBadge estado={entrada.estadoAnterior} />
              <ArrowRight className="size-4 text-muted-foreground" aria-label="pasó a" />
            </>
          ) : (
            <span className="font-medium">Registro de la solicitud:</span>
          )}
          <EstadoBadge estado={entrada.estadoNuevo} />
        </div>
        {entrada.observacion && <p className="mt-1">“{entrada.observacion}”</p>}
        {pie}
      </>
    );
  }
  if (entrada.tipo === 'EDICION') {
    return (
      <>
        <p className="flex items-center gap-2 font-medium">
          <Pencil className="size-4" aria-hidden="true" /> Edición de condiciones
        </p>
        <ul className="mt-1 text-sm">
          {entrada.cambios.map((cambio) => (
            <li key={cambio.campo}>
              {nombresCampo[cambio.campo] ?? cambio.campo}:{' '}
              {valorLegible(cambio.campo, cambio.valorAnterior)} →{' '}
              <strong className="font-medium">
                {valorLegible(cambio.campo, cambio.valorNuevo)}
              </strong>
            </li>
          ))}
        </ul>
        {entrada.motivo && <p className="mt-1">“{entrada.motivo}”</p>}
        {pie}
      </>
    );
  }
  return (
    <>
      <p className="flex items-center gap-2 font-medium text-destructive">
        <Trash2 className="size-4" aria-hidden="true" /> Eliminación
      </p>
      {entrada.motivo && <p className="mt-1">“{entrada.motivo}”</p>}
      {pie}
    </>
  );
}

export function Historial({ creditoId }: { creditoId: string }) {
  const { data, isPending, error, refetch } = useHistorial(creditoId);
  if (isPending) return <Cargando filas={3} etiqueta="Cargando el historial…" />;
  if (error) return <ErrorCarga error={error} reintentar={() => void refetch()} />;
  if (data.length === 0)
    return <SinDatos titulo="Sin historial" texto="Este crédito todavía no tiene movimientos." />;
  return (
    <ol className="relative flex flex-col gap-5 border-l pl-6">
      {data.map((entrada, indice) => (
        <li key={indice} className="relative">
          <span
            className="absolute top-1.5 -left-[29px] size-2.5 rounded-full border-2 border-card bg-muted-foreground"
            aria-hidden="true"
          />
          <Entrada entrada={entrada} />
        </li>
      ))}
    </ol>
  );
}
