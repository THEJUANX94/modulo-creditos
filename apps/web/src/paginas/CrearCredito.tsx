import { esquemaCrearCredito } from '@creditos/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { CampoMonto } from '@/components/CampoMonto';
import { Encabezado, ErrorCarga, Cargando } from '@/components/Estados';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorApi } from '@/lib/api';
import { useCatalogos, useCrearCredito } from '@/lib/consultas';
import { aplicarErroresDeCampos, avisarError } from '@/lib/errores';

// Crear crédito (enunciado: formulario con validaciones). Se valida con el mismo esquema que usa
// la API: al salir de cada campo (regla inline-validation), con el error debajo del campo.

type Entrada = z.input<typeof esquemaCrearCredito>;
type Salida = z.output<typeof esquemaCrearCredito>;
const campos = [
  'tipoIdentificacionAsociado',
  'identificacionAsociado',
  'nombreAsociado',
  'tipoCredito',
  'valorSolicitado',
  'tasaInteres',
  'numeroCuotas',
  'formaPago',
] as const;

export function CrearCredito() {
  const navegar = useNavigate();
  const catalogos = useCatalogos();
  const crear = useCrearCredito();
  const formulario = useForm<Entrada, unknown, Salida>({
    resolver: zodResolver(esquemaCrearCredito),
    mode: 'onTouched',
    defaultValues: {
      tipoIdentificacionAsociado: 'CC',
      identificacionAsociado: '',
      nombreAsociado: '',
      tipoCredito: '',
      valorSolicitado: '',
      tasaInteres: '',
      formaPago: '',
    },
  });
  const { errors, isSubmitting } = formulario.formState;

  const enviar = formulario.handleSubmit(async (datos) => {
    try {
      const credito = await crear.mutateAsync(datos);
      toast.success(`Crédito ${credito.numeroCredito} registrado`, {
        description: 'Se notificará al sistema externo en unos segundos.',
      });
      void navegar(`/creditos/${credito.id}`);
    } catch (error) {
      // Las reglas que dependen de la BD también se muestran junto a su campo.
      if (error instanceof ErrorApi && error.codigo === 'ASOCIADO_NOMBRE_NO_COINCIDE') {
        formulario.setError(
          'nombreAsociado',
          { type: 'servidor', message: error.message },
          { shouldFocus: true },
        );
      } else if (error instanceof ErrorApi && error.codigo === 'CREDITO_DUPLICADO') {
        formulario.setError(
          'tipoCredito',
          { type: 'servidor', message: error.message },
          { shouldFocus: true },
        );
      } else if (!aplicarErroresDeCampos(error, formulario.setError, campos)) {
        avisarError(error);
      }
    }
  });

  const ayuda = (campo: (typeof campos)[number], descripcion?: boolean) =>
    errors[campo] ? `${campo}-error` : descripcion ? `${campo}-ayuda` : undefined;

  if (catalogos.isPending) return <Cargando filas={6} etiqueta="Cargando el formulario…" />;
  if (catalogos.error)
    return <ErrorCarga error={catalogos.error} reintentar={() => void catalogos.refetch()} />;
  const { tiposIdentificacion, tiposCredito, formasPago } = catalogos.data;

  const selector = (
    campo: 'tipoIdentificacionAsociado' | 'tipoCredito' | 'formaPago',
    etiqueta: string,
    opciones: { codigo: string; nombre: string }[],
  ) => (
    <Field data-invalid={Boolean(errors[campo])}>
      <FieldLabel htmlFor={campo}>{etiqueta}</FieldLabel>
      <Controller
        control={formulario.control}
        name={campo}
        render={({ field }) => (
          <Select value={field.value ?? ''} onValueChange={field.onChange}>
            <SelectTrigger
              id={campo}
              ref={field.ref}
              onBlur={field.onBlur}
              className="w-full"
              aria-invalid={Boolean(errors[campo])}
              aria-describedby={ayuda(campo)}
            >
              <SelectValue placeholder="Seleccione…" />
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
      <FieldError id={`${campo}-error`} errors={[errors[campo]]} />
    </Field>
  );

  return (
    <>
      <Encabezado
        titulo="Nuevo crédito"
        descripcion="Registre la solicitud de crédito de un asociado. Queda en estado Solicitado."
      />
      <Card className="max-w-3xl">
        <CardContent>
          <form onSubmit={(evento) => void enviar(evento)} noValidate>
            <FieldGroup>
              <FieldSet>
                <FieldLegend>Asociado</FieldLegend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {selector(
                    'tipoIdentificacionAsociado',
                    'Tipo de identificación',
                    tiposIdentificacion,
                  )}
                  <Field data-invalid={Boolean(errors.identificacionAsociado)}>
                    <FieldLabel htmlFor="identificacionAsociado">Identificación</FieldLabel>
                    <Input
                      id="identificacionAsociado"
                      inputMode="text"
                      autoComplete="off"
                      aria-invalid={Boolean(errors.identificacionAsociado)}
                      aria-describedby={ayuda('identificacionAsociado')}
                      {...formulario.register('identificacionAsociado')}
                    />
                    <FieldError
                      id="identificacionAsociado-error"
                      errors={[errors.identificacionAsociado]}
                    />
                  </Field>
                  <Field data-invalid={Boolean(errors.nombreAsociado)} className="sm:col-span-2">
                    <FieldLabel htmlFor="nombreAsociado">Nombre del asociado</FieldLabel>
                    <Input
                      id="nombreAsociado"
                      autoComplete="off"
                      aria-invalid={Boolean(errors.nombreAsociado)}
                      aria-describedby={ayuda('nombreAsociado', true)}
                      {...formulario.register('nombreAsociado')}
                    />
                    <FieldDescription id="nombreAsociado-ayuda">
                      Si el asociado ya existe, el nombre tiene que coincidir con el registrado.
                    </FieldDescription>
                    <FieldError id="nombreAsociado-error" errors={[errors.nombreAsociado]} />
                  </Field>
                </div>
              </FieldSet>

              <FieldSet>
                <FieldLegend>Condiciones</FieldLegend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {selector('tipoCredito', 'Tipo de crédito', tiposCredito)}
                  {selector('formaPago', 'Forma de pago', formasPago)}
                  <Field data-invalid={Boolean(errors.valorSolicitado)}>
                    <FieldLabel htmlFor="valorSolicitado">Valor solicitado (COP)</FieldLabel>
                    <Controller
                      control={formulario.control}
                      name="valorSolicitado"
                      render={({ field }) => (
                        <CampoMonto
                          id="valorSolicitado"
                          ref={field.ref}
                          valor={String(field.value ?? '')}
                          alCambiar={field.onChange}
                          onBlur={field.onBlur}
                          aria-invalid={Boolean(errors.valorSolicitado)}
                          aria-describedby={ayuda('valorSolicitado', true)}
                        />
                      )}
                    />
                    <FieldDescription id="valorSolicitado-ayuda">
                      Hasta 2 decimales, separados con coma.
                    </FieldDescription>
                    <FieldError id="valorSolicitado-error" errors={[errors.valorSolicitado]} />
                  </Field>
                  <Field data-invalid={Boolean(errors.tasaInteres)}>
                    <FieldLabel htmlFor="tasaInteres">Tasa de interés (% mensual)</FieldLabel>
                    <Controller
                      control={formulario.control}
                      name="tasaInteres"
                      render={({ field }) => (
                        <Input
                          id="tasaInteres"
                          ref={field.ref}
                          inputMode="decimal"
                          value={String(field.value ?? '').replace('.', ',')}
                          onChange={(evento) =>
                            field.onChange(evento.target.value.replace(',', '.'))
                          }
                          onBlur={field.onBlur}
                          aria-invalid={Boolean(errors.tasaInteres)}
                          aria-describedby={ayuda('tasaInteres', true)}
                        />
                      )}
                    />
                    <FieldDescription id="tasaInteres-ayuda">
                      Por ejemplo 1,5 (mes vencido), hasta 4 decimales.
                    </FieldDescription>
                    <FieldError id="tasaInteres-error" errors={[errors.tasaInteres]} />
                  </Field>
                  <Field data-invalid={Boolean(errors.numeroCuotas)}>
                    <FieldLabel htmlFor="numeroCuotas">Número de cuotas</FieldLabel>
                    <Input
                      id="numeroCuotas"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={360}
                      aria-invalid={Boolean(errors.numeroCuotas)}
                      aria-describedby={ayuda('numeroCuotas', true)}
                      {...formulario.register('numeroCuotas', { valueAsNumber: true })}
                    />
                    <FieldDescription id="numeroCuotas-ayuda">
                      Mensuales, de 1 a 360.
                    </FieldDescription>
                    <FieldError id="numeroCuotas-error" errors={[errors.numeroCuotas]} />
                  </Field>
                </div>
              </FieldSet>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button asChild variant="ghost">
                  <Link to="/creditos">Cancelar</Link>
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Registrando…' : 'Registrar crédito'}
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
