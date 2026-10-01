import {
  contrasenaMinima,
  esquemaCrearUsuario,
  roles,
  type Rol,
  type Usuario,
} from '@creditos/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Cargando, Encabezado, ErrorCarga, Paginacion } from '@/components/Estados';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
import { ErrorApi } from '@/lib/api';
import { useCambiarUsuario, useCrearUsuario, useUsuarios } from '@/lib/consultas';
import { aplicarErroresDeCampos, avisarError } from '@/lib/errores';
import { formatearFecha } from '@/lib/formatos';
import { useUsuario } from '@/lib/sesion';

// Gestión de usuarios, solo ADMIN (ADR 0016): crear con contraseña temporal, activar o desactivar
// y cambiar el rol. Desactivar o cambiar el rol corta la sesión del usuario al instante.

export const nombresRol: Record<Rol, string> = {
  ASESOR: 'Asesor',
  ANALISTA: 'Analista',
  TESORERIA: 'Tesorería',
  ADMIN: 'Administrador',
};

type Entrada = z.input<typeof esquemaCrearUsuario>;
type Salida = z.output<typeof esquemaCrearUsuario>;

function DialogoCrear({ abierto, cerrar }: { abierto: boolean; cerrar: () => void }) {
  const crear = useCrearUsuario();
  const formulario = useForm<Entrada, unknown, Salida>({
    resolver: zodResolver(esquemaCrearUsuario),
    mode: 'onTouched',
    defaultValues: { correo: '', nombre: '', rol: 'ASESOR', contrasenaTemporal: '' },
  });
  const { errors, isSubmitting } = formulario.formState;

  const enviar = formulario.handleSubmit(async (datos) => {
    try {
      const usuario = await crear.mutateAsync(datos);
      toast.success(`Usuario ${usuario.correo} creado`, {
        description: 'Al entrar por primera vez, tendrá que cambiar la contraseña temporal.',
      });
      formulario.reset();
      cerrar();
    } catch (error) {
      if (error instanceof ErrorApi && error.codigo === 'CORREO_DUPLICADO') {
        formulario.setError('correo', { type: 'servidor', message: error.message });
      } else if (
        !aplicarErroresDeCampos(error, formulario.setError, [
          'correo',
          'nombre',
          'rol',
          'contrasenaTemporal',
        ])
      ) {
        avisarError(error);
      }
    }
  });

  return (
    <Dialog open={abierto} onOpenChange={(valor) => !valor && !isSubmitting && cerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>
            Comparta la contraseña temporal por un canal seguro: el usuario la cambia al entrar.
          </DialogDescription>
        </DialogHeader>
        <form id="crear-usuario" onSubmit={(evento) => void enviar(evento)} noValidate>
          <FieldGroup>
            <Field data-invalid={Boolean(errors.nombre)}>
              <FieldLabel htmlFor="nuevo-nombre">Nombre</FieldLabel>
              <Input
                id="nuevo-nombre"
                aria-invalid={Boolean(errors.nombre)}
                {...formulario.register('nombre')}
              />
              <FieldError errors={[errors.nombre]} />
            </Field>
            <Field data-invalid={Boolean(errors.correo)}>
              <FieldLabel htmlFor="nuevo-correo">Correo</FieldLabel>
              <Input
                id="nuevo-correo"
                type="email"
                autoComplete="off"
                aria-invalid={Boolean(errors.correo)}
                {...formulario.register('correo')}
              />
              <FieldError errors={[errors.correo]} />
            </Field>
            <Field data-invalid={Boolean(errors.rol)}>
              <FieldLabel htmlFor="nuevo-rol">Rol</FieldLabel>
              <Controller
                control={formulario.control}
                name="rol"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="nuevo-rol" ref={field.ref} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((rol) => (
                        <SelectItem key={rol} value={rol}>
                          {nombresRol[rol]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.rol]} />
            </Field>
            <Field data-invalid={Boolean(errors.contrasenaTemporal)}>
              <FieldLabel htmlFor="nuevo-clave">Contraseña temporal</FieldLabel>
              <Input
                id="nuevo-clave"
                type="text"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.contrasenaTemporal)}
                {...formulario.register('contrasenaTemporal')}
              />
              <FieldDescription>Al menos {contrasenaMinima} caracteres.</FieldDescription>
              <FieldError errors={[errors.contrasenaTemporal]} />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={cerrar} disabled={isSubmitting}>
            Volver
          </Button>
          <Button type="submit" form="crear-usuario" disabled={isSubmitting}>
            {isSubmitting ? 'Creando…' : 'Crear usuario'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilaUsuario({ usuario, esUnoMismo }: { usuario: Usuario; esUnoMismo: boolean }) {
  const cambiar = useCambiarUsuario();
  const aplicar = (cambio: { activo?: boolean; rol?: Rol }, exito: string) =>
    cambiar.mutate(
      { id: usuario.id, ...cambio },
      { onSuccess: () => toast.success(exito), onError: avisarError },
    );

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{usuario.nombre}</div>
        <div className="text-sm text-muted-foreground">{usuario.correo}</div>
      </TableCell>
      <TableCell>
        <Select
          value={usuario.rol}
          disabled={esUnoMismo || cambiar.isPending}
          onValueChange={(rol) =>
            aplicar({ rol: rol as Rol }, `${usuario.nombre} ahora es ${nombresRol[rol as Rol]}`)
          }
        >
          <SelectTrigger className="w-40" aria-label={`Rol de ${usuario.nombre}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((rol) => (
              <SelectItem key={rol} value={rol}>
                {nombresRol[rol]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {usuario.activo ? 'Activo' : 'Inactivo'}
        {usuario.debeCambiarContrasena && (
          <div className="text-sm text-muted-foreground">Contraseña temporal</div>
        )}
      </TableCell>
      <TableCell>{formatearFecha(usuario.fechaCreacion)}</TableCell>
      <TableCell className="text-right">
        {!esUnoMismo && (
          <Button
            variant={usuario.activo ? 'outline' : 'default'}
            disabled={cambiar.isPending}
            onClick={() =>
              aplicar(
                { activo: !usuario.activo },
                usuario.activo ? `${usuario.nombre} desactivado` : `${usuario.nombre} activado`,
              )
            }
          >
            {usuario.activo ? 'Desactivar' : 'Activar'}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

export function Usuarios() {
  const yo = useUsuario();
  const [pagina, setPagina] = useState(1);
  const [creando, setCreando] = useState(false);
  const { data, isPending, error, refetch } = useUsuarios(pagina);

  return (
    <>
      <Encabezado
        titulo="Usuarios"
        descripcion="Desactivar a un usuario o cambiar su rol cierra su sesión al instante."
        acciones={
          <Button onClick={() => setCreando(true)}>
            <UserPlus aria-hidden="true" /> Nuevo usuario
          </Button>
        }
      />
      {isPending ? (
        <Cargando filas={4} etiqueta="Cargando usuarios…" />
      ) : error ? (
        <ErrorCarga error={error} reintentar={() => void refetch()} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.datos.map((usuario) => (
                  <FilaUsuario
                    key={usuario.id}
                    usuario={usuario}
                    esUnoMismo={usuario.id === yo.id}
                  />
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
      <DialogoCrear abierto={creando} cerrar={() => setCreando(false)} />
    </>
  );
}
