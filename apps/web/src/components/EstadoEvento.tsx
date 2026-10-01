import type { EstadoEventoWebhook, ResultadoIntentoWebhook } from '@creditos/shared';
import { CircleCheck, CircleX, Clock, type LucideIcon } from 'lucide-react';
import { cn } from 'cn';

// Estado de la notificación del webhook (ADR 0018), con texto e icono (regla color-not-only).
// Reutiliza los tonos de los estados del crédito: entregado en verde, pendiente en azul y fallido
// en rojo.
const estilos: Record<EstadoEventoWebhook, { nombre: string; icono: LucideIcon; clases: string }> =
  {
    ENTREGADO: {
      nombre: 'Entregado',
      icono: CircleCheck,
      clases: 'bg-estado-desembolsado-fondo text-estado-desembolsado',
    },
    PENDIENTE: {
      nombre: 'Pendiente',
      icono: Clock,
      clases: 'bg-estado-en-estudio-fondo text-estado-en-estudio',
    },
    FALLIDO: {
      nombre: 'Fallido',
      icono: CircleX,
      clases: 'bg-estado-rechazado-fondo text-estado-rechazado',
    },
  };

export function EstadoEvento({ estado }: { estado: EstadoEventoWebhook }) {
  const { nombre, icono: Icono, clases } = estilos[estado];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap',
        clases,
      )}
    >
      <Icono className="size-3.5" aria-hidden="true" />
      {nombre}
    </span>
  );
}

export const nombresResultado: Record<ResultadoIntentoWebhook, string> = {
  EXITOSO: 'Exitoso',
  ERROR_HTTP: 'Error HTTP',
  TIMEOUT: 'Sin respuesta (timeout)',
  ERROR_RED: 'Error de red',
};
