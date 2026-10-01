import {
  contrasenaMinima,
  esquemaCambioContrasena,
  type DatosCambioContrasena,
} from '@creditos/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { aplicarErroresDeCampos, avisarError } from '@/lib/errores';
import { useSesion } from '@/lib/sesion';

// La contraseña temporal que asigna un ADMIN se cambia antes de usar el sistema (ADR 0016).
export function CambiarContrasena() {
  const { cambiarContrasena, cerrarSesion } = useSesion();
  const navegar = useNavigate();
  const formulario = useForm<DatosCambioContrasena>({
    resolver: zodResolver(esquemaCambioContrasena),
    mode: 'onTouched',
    defaultValues: { contrasenaActual: '', contrasenaNueva: '' },
  });
  const { errors, isSubmitting } = formulario.formState;

  const enviar = formulario.handleSubmit(async (datos) => {
    try {
      await cambiarContrasena(datos.contrasenaActual, datos.contrasenaNueva);
      toast.success('Contraseña cambiada');
      void navegar('/', { replace: true });
    } catch (error) {
      if (
        !aplicarErroresDeCampos(error, formulario.setError, ['contrasenaActual', 'contrasenaNueva'])
      ) {
        avisarError(error);
      }
    }
  });

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">Cambie su contraseña temporal</h1>
          </CardTitle>
          <CardDescription>
            Un administrador le asignó una contraseña temporal. Elija una propia para continuar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(evento) => void enviar(evento)} noValidate>
            <FieldGroup>
              <Field data-invalid={Boolean(errors.contrasenaActual)}>
                <FieldLabel htmlFor="actual">Contraseña temporal</FieldLabel>
                <Input
                  id="actual"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.contrasenaActual)}
                  aria-describedby={errors.contrasenaActual ? 'actual-error' : undefined}
                  {...formulario.register('contrasenaActual')}
                />
                <FieldError id="actual-error" errors={[errors.contrasenaActual]} />
              </Field>
              <Field data-invalid={Boolean(errors.contrasenaNueva)}>
                <FieldLabel htmlFor="nueva">Contraseña nueva</FieldLabel>
                <Input
                  id="nueva"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={Boolean(errors.contrasenaNueva)}
                  aria-describedby={errors.contrasenaNueva ? 'nueva-error' : 'nueva-ayuda'}
                  {...formulario.register('contrasenaNueva')}
                />
                <FieldDescription id="nueva-ayuda">
                  Al menos {contrasenaMinima} caracteres. Una frase larga es más segura que una
                  palabra con símbolos.
                </FieldDescription>
                <FieldError id="nueva-error" errors={[errors.contrasenaNueva]} />
              </Field>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void cerrarSesion().catch(avisarError)}
                >
                  Salir
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Guardando…' : 'Cambiar contraseña'}
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
