import type { EstadoCredito } from '@creditos/shared';
import {
  Ban,
  Banknote,
  CircleCheck,
  CircleX,
  FileText,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { cn } from 'cn';
import { nombresEstado } from '@/lib/estados';

// Badge del estado del crédito (ADR 0021): tono suave por estado, siempre con texto e icono
// (regla color-not-only). Contraste medido entre 6,15:1 y 12,30:1 en los dos modos.

const estilos: Record<EstadoCredito, { icono: LucideIcon; clases: string }> = {
  SOLICITADO: { icono: FileText, clases: 'bg-estado-solicitado-fondo text-estado-solicitado' },
  EN_ESTUDIO: { icono: Search, clases: 'bg-estado-en-estudio-fondo text-estado-en-estudio' },
  APROBADO: { icono: CircleCheck, clases: 'bg-estado-aprobado-fondo text-estado-aprobado' },
  DESEMBOLSADO: {
    icono: Banknote,
    clases: 'bg-estado-desembolsado-fondo text-estado-desembolsado',
  },
  RECHAZADO: { icono: CircleX, clases: 'bg-estado-rechazado-fondo text-estado-rechazado' },
  CANCELADO: {
    icono: Ban,
    clases: 'border border-estado-cancelado bg-estado-cancelado-fondo text-estado-cancelado',
  },
};

export function EstadoBadge({ estado, className }: { estado: EstadoCredito; className?: string }) {
  const { icono: Icono, clases } = estilos[estado];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap',
        clases,
        className,
      )}
    >
      <Icono className="size-3.5" aria-hidden="true" />
      {nombresEstado[estado]}
    </span>
  );
}
