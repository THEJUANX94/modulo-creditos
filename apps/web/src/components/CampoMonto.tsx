import type { ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { montoDesdeCampo, montoParaCampo } from '@/lib/formatos';

// Campo de dinero (ADR 0021): muestra "15.000.000,5" mientras se escribe, pero el valor del
// formulario es el string exacto "15000000.5" que viaja a la API. Nunca pasa por un número
// binario, así que no hay redondeos.
export function CampoMonto({
  valor,
  alCambiar,
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  valor: string;
  alCambiar: (valor: string) => void;
}) {
  return (
    <Input
      {...props}
      inputMode="decimal"
      value={montoParaCampo(valor.replace('.', ','))}
      onChange={(evento) => alCambiar(montoDesdeCampo(montoParaCampo(evento.target.value)))}
    />
  );
}
