import { esquemaLogin, type DatosLogin } from '@creditos/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, Landmark } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { SelectorTema } from '@/components/SelectorTema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { describirError } from '@/lib/errores';
import { useSesion } from '@/lib/sesion';

export function Login() {
  const { sesion, iniciarSesion } = useSesion();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const formulario = useForm<DatosLogin>({
    resolver: zodResolver(esquemaLogin),
    mode: 'onTouched',
    defaultValues: { correo: '', contrasena: '' },
  });
  const { errors, isSubmitting } = formulario.formState;

  if (sesion.estado === 'activo') return <Navigate to="/" replace />;
  const destino = (ubicacion.state as { desde?: string } | null)?.desde ?? '/';
  const aviso = sesion.estado === 'anonimo' ? sesion.aviso : undefined;

  const enviar = formulario.handleSubmit(async (datos) => {
    setErrorEnvio(null);
    try {
      const usuario = await iniciarSesion(datos.correo, datos.contrasena);
      void navegar(usuario.debeCambiarContrasena ? '/cambiar-contrasena' : destino, {
        replace: true,
      });
    } catch (error) {
      setErrorEnvio(describirError(error).titulo);
    }
  });

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="absolute top-4 right-4">
        <SelectorTema />
      </div>
      <div className="flex items-center gap-2 text-lg font-semibold">
        <Landmark className="size-6 text-dorado" aria-hidden="true" />
        Módulo de Créditos
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">Iniciar sesión</h1>
          </CardTitle>
          <CardDescription>Ingrese con el correo y la contraseña de su usuario.</CardDescription>
        </CardHeader>
        <CardContent>
          {(aviso ?? errorEnvio) && (
            <div
              role="alert"
              className="mb-4 flex gap-2 rounded-lg border border-destructive px-3 py-2 text-sm"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
              <span>{errorEnvio ?? aviso}</span>
            </div>
          )}
          <form onSubmit={(evento) => void enviar(evento)} noValidate>
            <FieldGroup>
              <Field data-invalid={Boolean(errors.correo)}>
                <FieldLabel htmlFor="correo">Correo</FieldLabel>
                <Input
                  id="correo"
                  type="email"
                  autoComplete="username"
                  aria-invalid={Boolean(errors.correo)}
                  aria-describedby={errors.correo ? 'correo-error' : undefined}
                  {...formulario.register('correo')}
                />
                <FieldError id="correo-error" errors={[errors.correo]} />
              </Field>
              <Field data-invalid={Boolean(errors.contrasena)}>
                <FieldLabel htmlFor="contrasena">Contraseña</FieldLabel>
                <Input
                  id="contrasena"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.contrasena)}
                  aria-describedby={errors.contrasena ? 'contrasena-error' : undefined}
                  {...formulario.register('contrasena')}
                />
                <FieldError id="contrasena-error" errors={[errors.contrasena]} />
              </Field>
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? 'Ingresando…' : 'Ingresar'}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
