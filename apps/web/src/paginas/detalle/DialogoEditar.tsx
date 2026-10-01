import {
  esquemaNumeroCuotas,
  esquemaTasaInteres,
  esquemaValorSolicitado,
  type Credito,
} from '@creditos/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { CampoMonto } from '@/components/CampoMonto';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ErrorApi } from '@/lib/api';
import { useCatalogos, useEditarCredito } from '@/lib/consultas';
import { aplicarErroresDeCampos, avisarError } from '@/lib/errores';

// Editar las condiciones de un crédito en SOLICITADO (ADR 0014). Solo se envían los campos que
// cambiaron, con la versión: si otro usuario lo modificó antes, la API responde 409.

// Las mismas piezas que el esquema de la API (esquemaEditarCredito), sin la versión, que la pone
// la mutación. Que al menos un campo cambie se resuelve al enviar.
const esquemaFormulario = z.object({
  tipoCredito: z.string().min(1, 'Es obligatorio'),
  valorSolicitado: esquemaValorSolicitado,
  tasaInteres: esquemaTasaInteres,
  numeroCuotas: esquemaNumeroCuotas,
  formaPago: z.string().min(1, 'Es obligatorio'),
  motivo: z.string().trim().max(500, 'Puede tener como máximo 500 caracteres').optional(),
});
type Entrada = z.input<typeof esquemaFormulario>;
type Salida = z.output<typeof esquemaFormulario>;
const campos = [
  'tipoCredito',
  'valorSolicitado',
  'tasaInteres',
  'numeroCuotas',
  'formaPago',
  'motivo',
] as const;

export function DialogoEditar({
  credito,
  abierto,
  cerrar,
  alConflicto,
}: {
  credito: Credito;
  abierto: boolean;
  cerrar: () => void;
  alConflicto: (error: unknown) => void;
}) {
  const { data: catalogos } = useCatalogos();
  const editar = useEditarCredito(credito);
  const valoresActuales = (): Entrada => ({
    tipoCredito: credito.tipoCredito,
    valorSolicitado: credito.valorSolicitado,
    tasaInteres: credito.tasaInteres,
    numeroCuotas: credito.numeroCuotas,
    formaPago: credito.formaPago,
    motivo: '',
  });
  const formulario = useForm<Entrada, unknown, Salida>({
    resolver: zodResolver(esquemaFormulario),
    mode: 'onTouched',
    defaultValues: valoresActuales(),
  });
  const { errors, isSubmitting, dirtyFields } = formulario.formState;

  // Cada vez que se abre, parte de la versión actual del crédito.
  useEffect(() => {
    if (abierto) formulario.reset(valoresActuales());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir o al cambiar de versión
  }, [abierto, credito.version]);

  const enviar = formulario.handleSubmit(async (datos) => {
    // Solo lo que el usuario cambió (y el motivo, si lo escribió).
    const cambios = Object.fromEntries(
      Object.entries(datos).filter(([campo, valor]) =>
        campo === 'motivo' ? Boolean(valor) : dirtyFields[campo as keyof Entrada],
      ),
    );
    if (Object.keys(cambios).filter((campo) => campo !== 'motivo').length === 0) {
      cerrar();
      return;
    }
    try {
      const actualizado = await editar.mutateAsync(cambios);
      toast.success(`Crédito ${actualizado.numeroCredito} actualizado`);
      cerrar();
    } catch (error) {
      if (error instanceof ErrorApi && error.codigo === 'CREDITO_MODIFICADO') {
        cerrar();
        alConflicto(error);
      } else if (error instanceof ErrorApi && error.codigo === 'CREDITO_DUPLICADO') {
        formulario.setError('tipoCredito', { type: 'servidor', message: error.message });
      } else if (!aplicarErroresDeCampos(error, formulario.setError, campos)) {
        avisarError(error);
      }
    }
  });

  const selector = (
    campo: 'tipoCredito' | 'formaPago',
    etiqueta: string,
    opciones: { codigo: string; nombre: string }[],
  ) => (
    <Field data-invalid={Boolean(errors[campo])}>
      <FieldLabel htmlFor={`editar-${campo}`}>{etiqueta}</FieldLabel>
      <Controller
        control={formulario.control}
        name={campo}
        render={({ field }) => (
          <Select value={field.value ?? ''} onValueChange={field.onChange}>
            <SelectTrigger
              id={`editar-${campo}`}
              ref={field.ref}
              className="w-full"
              aria-invalid={Boolean(errors[campo])}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {opciones.map((opcion) => (
                <SelectItem key={opcion.codigo} value={opcion.codigo}>
                  {opcion.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <FieldError errors={[errors[campo]]} />
    </Field>
  );

  return (
    <Dialog open={abierto} onOpenChange={(valor) => !valor && !isSubmitting && cerrar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar {credito.numeroCredito}</DialogTitle>
          <DialogDescription>
            Solo se pueden editar las condiciones mientras el crédito está Solicitado.
          </DialogDescription>
        </DialogHeader>
        <form id="editar-credito" onSubmit={(evento) => void enviar(evento)} noValidate>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              {selector('tipoCredito', 'Tipo de crédito', catalogos?.tiposCredito ?? [])}
              {selector('formaPago', 'Forma de pago', catalogos?.formasPago ?? [])}
              <Field data-invalid={Boolean(errors.valorSolicitado)}>
                <FieldLabel htmlFor="editar-valor">Valor solicitado (COP)</FieldLabel>
                <Controller
                  control={formulario.control}
                  name="valorSolicitado"
                  render={({ field }) => (
                    <CampoMonto
                      id="editar-valor"
                      ref={field.ref}
                      valor={String(field.value ?? '')}
                      alCambiar={field.onChange}
                      onBlur={field.onBlur}
                      aria-invalid={Boolean(errors.valorSolicitado)}
                    />
                  )}
                />
                <FieldError errors={[errors.valorSolicitado]} />
              </Field>
              <Field data-invalid={Boolean(errors.tasaInteres)}>
                <FieldLabel htmlFor="editar-tasa">Tasa (% mensual)</FieldLabel>
                <Controller
                  control={formulario.control}
                  name="tasaInteres"
                  render={({ field }) => (
                    <Input
                      id="editar-tasa"
                      ref={field.ref}
                      inputMode="decimal"
                      value={String(field.value ?? '').replace('.', ',')}
                      onChange={(evento) => field.onChange(evento.target.value.replace(',', '.'))}
                      onBlur={field.onBlur}
                      aria-invalid={Boolean(errors.tasaInteres)}
                    />
                  )}
                />
                <FieldError errors={[errors.tasaInteres]} />
              </Field>
              <Field data-invalid={Boolean(errors.numeroCuotas)}>
                <FieldLabel htmlFor="editar-cuotas">Número de cuotas</FieldLabel>
                <Input
                  id="editar-cuotas"
                  type="number"
                  min={1}
                  max={360}
                  aria-invalid={Boolean(errors.numeroCuotas)}
                  {...formulario.register('numeroCuotas', { valueAsNumber: true })}
                />
                <FieldError errors={[errors.numeroCuotas]} />
              </Field>
            </div>
            <Field data-invalid={Boolean(errors.motivo)}>
              <FieldLabel htmlFor="editar-motivo">Motivo (opcional)</FieldLabel>
              <Textarea id="editar-motivo" maxLength={500} {...formulario.register('motivo')} />
              <FieldError errors={[errors.motivo]} />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={cerrar} disabled={isSubmitting}>
            Volver
          </Button>
          <Button type="submit" form="editar-credito" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
