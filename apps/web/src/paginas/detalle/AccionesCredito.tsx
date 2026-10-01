import { puede, type Credito } from '@creditos/shared';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { ErrorApi } from '@/lib/api';
import { useCambiarEstado, useEliminarCredito } from '@/lib/consultas';
import { accionesDisponibles, nombresEstado, type AccionEstado } from '@/lib/estados';
import { avisarError } from '@/lib/errores';
import { useUsuario } from '@/lib/sesion';
import { DialogoEditar } from './DialogoEditar';

// Acciones del detalle: solo las transiciones válidas para el estado y el rol (ADR 0021). Todo
// cambio de estado se confirma; rechazar, cancelar y eliminar piden el motivo y van en el color de
// peligro, separados de las acciones principales (reglas confirmation-dialogs y
// destructive-emphasis).

type Pendiente = { tipo: 'estado'; accion: AccionEstado } | { tipo: 'eliminar' };

const maximoMotivo = 500;

function avisarConflicto(error: unknown): void {
  // Otro usuario cambió el crédito mientras se miraba: la consulta ya se recargó.
  if (error instanceof ErrorApi && error.codigo === 'CREDITO_MODIFICADO') {
    toast.error('Otro usuario modificó este crédito', {
      description: 'Se cargó la versión actual. Revise los datos y vuelva a intentarlo.',
    });
    return;
  }
  avisarError(error);
}

export function AccionesCredito({ credito, recargar }: { credito: Credito; recargar: () => void }) {
  const usuario = useUsuario();
  const navegar = useNavigate();
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [editando, setEditando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);
  const cambiarEstado = useCambiarEstado(credito);
  const eliminar = useEliminarCredito(credito);

  const acciones = accionesDisponibles(credito, usuario.rol);
  const principales = acciones.filter((accion) => !accion.destructiva);
  const destructivas = acciones.filter((accion) => accion.destructiva);
  const enSolicitado = credito.estado === 'SOLICITADO' && !credito.eliminacion;
  const puedeEditar = enSolicitado && puede(usuario.rol, 'editarCredito');
  const puedeEliminar = enSolicitado && puede(usuario.rol, 'eliminarCredito');

  if (!acciones.length && !puedeEditar && !puedeEliminar) return null;

  const pideMotivo =
    pendiente?.tipo === 'eliminar' ||
    (pendiente?.tipo === 'estado' && pendiente.accion.pideObservacion);
  const enviando = cambiarEstado.isPending || eliminar.isPending;

  const abrir = (siguiente: Pendiente) => {
    setMotivo('');
    setErrorMotivo(null);
    setPendiente(siguiente);
  };

  const confirmar = async () => {
    if (!pendiente) return;
    const texto = motivo.trim();
    if (pideMotivo && !texto) {
      setErrorMotivo('Escriba el motivo: queda en el historial del crédito.');
      return;
    }
    try {
      if (pendiente.tipo === 'eliminar') {
        await eliminar.mutateAsync(texto);
        toast.success(`Crédito ${credito.numeroCredito} eliminado`);
        void navegar('/creditos');
      } else {
        const actualizado = await cambiarEstado.mutateAsync({
          estado: pendiente.accion.destino,
          ...(texto && { observacion: texto }),
        });
        toast.success(`Crédito ${actualizado.numeroCredito}: ${nombresEstado[actualizado.estado]}`);
      }
      setPendiente(null);
    } catch (error) {
      setPendiente(null);
      if (error instanceof ErrorApi && error.codigo === 'CREDITO_MODIFICADO') recargar();
      avisarConflicto(error);
    }
  };

  const titulo =
    pendiente?.tipo === 'eliminar'
      ? `¿Eliminar el crédito ${credito.numeroCredito}?`
      : pendiente
        ? `¿${pendiente.accion.etiqueta} el crédito ${credito.numeroCredito}?`
        : '';
  const descripcion =
    pendiente?.tipo === 'eliminar'
      ? 'Deja de aparecer en el listado y en el dashboard. Queda registrado quién lo eliminó y por qué.'
      : pendiente
        ? `Pasará a ${nombresEstado[pendiente.accion.destino]}. El cambio queda en el historial con su usuario.`
        : '';
  const destructiva =
    pendiente?.tipo === 'eliminar' ||
    (pendiente?.tipo === 'estado' && pendiente.accion.destructiva);

  return (
    <section aria-label="Acciones" className="flex flex-wrap items-center gap-2">
      {principales.map((accion) => (
        <Button key={accion.destino} onClick={() => abrir({ tipo: 'estado', accion })}>
          {accion.etiqueta}
        </Button>
      ))}
      {puedeEditar && (
        <Button variant="outline" onClick={() => setEditando(true)}>
          <Pencil aria-hidden="true" /> Editar
        </Button>
      )}
      {(destructivas.length > 0 || puedeEliminar) && (
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {destructivas.map((accion) => (
            <Button
              key={accion.destino}
              variant="destructive"
              onClick={() => abrir({ tipo: 'estado', accion })}
            >
              {accion.etiqueta}
            </Button>
          ))}
          {puedeEliminar && (
            <Button variant="destructive" onClick={() => abrir({ tipo: 'eliminar' })}>
              <Trash2 aria-hidden="true" /> Eliminar
            </Button>
          )}
        </div>
      )}

      <Dialog
        open={pendiente !== null}
        onOpenChange={(abierto) => !abierto && !enviando && setPendiente(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descripcion}</DialogDescription>
          </DialogHeader>
          {pideMotivo && (
            <Field data-invalid={Boolean(errorMotivo)}>
              <FieldLabel htmlFor="motivo">Motivo</FieldLabel>
              <Textarea
                id="motivo"
                value={motivo}
                maxLength={maximoMotivo}
                onChange={(evento) => setMotivo(evento.target.value)}
                aria-invalid={Boolean(errorMotivo)}
                aria-describedby={errorMotivo ? 'motivo-error' : 'motivo-ayuda'}
              />
              <FieldDescription id="motivo-ayuda">
                Obligatorio. Máximo {maximoMotivo} caracteres.
              </FieldDescription>
              {errorMotivo && <FieldError id="motivo-error">{errorMotivo}</FieldError>}
            </Field>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={enviando}>
                Volver
              </Button>
            </DialogClose>
            <Button
              variant={destructiva ? 'destructive' : 'default'}
              disabled={enviando}
              onClick={() => void confirmar()}
            >
              {enviando
                ? 'Guardando…'
                : pendiente?.tipo === 'eliminar'
                  ? 'Eliminar'
                  : (pendiente?.accion.etiqueta ?? '')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {puedeEditar && (
        <DialogoEditar
          credito={credito}
          abierto={editando}
          cerrar={() => setEditando(false)}
          alConflicto={(error) => {
            recargar();
            avisarConflicto(error);
          }}
        />
      )}
    </section>
  );
}
