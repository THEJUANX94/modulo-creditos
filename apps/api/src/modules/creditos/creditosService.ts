import { randomUUID } from 'node:crypto';
import {
  camposEditables,
  estadosCredito,
  puede,
  puedeCambiarA,
  puedeTransicionar,
  type Credito,
  type DatosCambiarEstado,
  type DatosCrearCredito,
  type DatosEditarCredito,
  type DatosEliminarCredito,
  type EntradaHistorial,
  type EstadoCredito,
  type FiltrosCreditos,
  type MetaPaginacion,
  type ResumenCreditos,
} from '@creditos/shared';
import { Prisma } from '../../generated/prisma/client';
import { esViolacionUnica } from '../../shared/db/erroresBd';
import { prisma } from '../../shared/db/prisma';
import { AppError } from '../../shared/errores/appError';
import {
  registrarEventoSeguridadAparte,
  type OrigenPeticion,
} from '../../shared/seguridad/eventosSeguridad';
import type { UsuarioAutenticado } from '../auth/autenticar';
import * as catalogosService from '../catalogos/catalogosService';
import * as webhooksService from '../webhooks/webhooksService';
import * as creditosRepository from './creditosRepository';

// Reglas de negocio del crédito (ADR 0014). La BD repite las que se pueden expresar como
// restricción: este service da el código de error y el mensaje; la BD es la última garantía.

const noEncontrado = () => new AppError('CREDITO_NOT_FOUND', 'El crédito no existe');
const duplicado = () =>
  new AppError(
    'CREDITO_DUPLICADO',
    'El asociado ya tiene un crédito de ese tipo en curso (solicitado, en estudio o aprobado)',
  );
const modificado = () =>
  new AppError(
    'CREDITO_MODIFICADO',
    'Otro usuario modificó el crédito después de que usted lo consultara. Recárguelo e intente de nuevo.',
  );

function mismoUsuario(a: string | null, b: string): boolean {
  return a !== null && a.toLowerCase() === b.toLowerCase();
}

// Un crédito eliminado solo existe para quien puede ver eliminados (ADMIN), y solo para leerlo.
async function obtenerVisible(id: string, actor: UsuarioAutenticado): Promise<Credito> {
  const credito = await creditosRepository.obtener(prisma, id);
  if (!credito) throw noEncontrado();
  if (credito.eliminacion && !puede(actor.rol, 'verEliminados')) throw noEncontrado();
  return credito;
}

async function obtenerModificable(id: string): Promise<Credito> {
  const credito = await creditosRepository.obtener(prisma, id);
  if (!credito || credito.eliminacion) throw noEncontrado();
  return credito;
}

async function denegar(
  actor: UsuarioAutenticado,
  origen: OrigenPeticion,
  ruta: string,
  detalle: string,
  mensaje: string,
): Promise<never> {
  await registrarEventoSeguridadAparte(origen, {
    tipoEvento: 'ACCESO_DENEGADO',
    usuarioId: actor.id,
    sesionId: actor.sesionId,
    ruta,
    detalle,
  });
  throw new AppError('SIN_PERMISO', mensaje);
}

// ───────────── Lecturas ─────────────

export async function obtener(id: string, actor: UsuarioAutenticado): Promise<Credito> {
  return obtenerVisible(id, actor);
}

export async function listar(
  filtros: FiltrosCreditos,
  actor: UsuarioAutenticado,
): Promise<{ creditos: Credito[]; meta: MetaPaginacion }> {
  if (filtros.incluirEliminados && !puede(actor.rol, 'verEliminados')) {
    throw new AppError('SIN_PERMISO', 'Solo un ADMIN puede incluir créditos eliminados');
  }
  const { creditos, total } = await creditosRepository.listar(filtros);
  return {
    creditos,
    meta: {
      pagina: filtros.pagina,
      tamanoPagina: filtros.tamanoPagina,
      total,
      totalPaginas: Math.ceil(total / filtros.tamanoPagina),
    },
  };
}

export async function resumen(): Promise<ResumenCreditos> {
  const totales = await creditosRepository.totalesPorEstado();
  const cero = new Prisma.Decimal(0);

  const porEstado = Object.fromEntries(
    estadosCredito.map((estado) => [estado, { cantidad: 0, monto: cero.toFixed(2) }]),
  ) as ResumenCreditos['porEstado'];

  let total = 0;
  let montoTotal = cero;
  for (const grupo of totales) {
    const monto = grupo.monto ?? cero;
    porEstado[grupo.estado] = { cantidad: grupo.cantidad, monto: monto.toFixed(2) };
    total += grupo.cantidad;
    montoTotal = montoTotal.plus(monto);
  }
  return { total, montoTotal: montoTotal.toFixed(2), porEstado };
}

export async function historial(
  id: string,
  actor: UsuarioAutenticado,
): Promise<EntradaHistorial[]> {
  await obtenerVisible(id, actor);
  const { estados, cambios } = await creditosRepository.obtenerHistorial(id);

  const entradas: EntradaHistorial[] = estados.map((fila) => ({
    tipo: 'ESTADO',
    fecha: fila.fecha.toISOString(),
    usuario: { id: fila.Usuarios.id.toLowerCase(), nombre: fila.Usuarios.nombre },
    estadoAnterior: fila.estadoAnterior as EstadoCredito | null,
    estadoNuevo: fila.estadoNuevo as EstadoCredito,
    observacion: fila.observacion,
  }));

  // Las filas de una misma edición se agrupan por operacionId; el borrado lógico va aparte.
  const ediciones = new Map<string, Extract<EntradaHistorial, { tipo: 'EDICION' }>>();
  for (const fila of cambios) {
    const usuario = { id: fila.Usuarios.id.toLowerCase(), nombre: fila.Usuarios.nombre };
    if (fila.campo === 'fechaEliminacion') {
      entradas.push({
        tipo: 'ELIMINACION',
        fecha: fila.fecha.toISOString(),
        usuario,
        motivo: fila.motivo,
      });
      continue;
    }
    const operacionId = fila.operacionId.toLowerCase();
    const edicion = ediciones.get(operacionId) ?? {
      tipo: 'EDICION',
      fecha: fila.fecha.toISOString(),
      usuario,
      operacionId,
      motivo: fila.motivo,
      cambios: [],
    };
    edicion.cambios.push({
      campo: fila.campo,
      valorAnterior: fila.valorAnterior,
      valorNuevo: fila.valorNuevo,
    });
    ediciones.set(operacionId, edicion);
  }
  entradas.push(...ediciones.values());

  // Lo más reciente primero.
  return entradas.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// ───────────── Crear ─────────────

export async function crear(
  datos: DatosCrearCredito,
  actor: UsuarioAutenticado,
  origen: OrigenPeticion,
): Promise<Credito> {
  await catalogosService.verificarCodigos({
    tipoCredito: datos.tipoCredito,
    formaPago: datos.formaPago,
    tipoIdentificacionAsociado: datos.tipoIdentificacionAsociado,
  });

  const crearEnTransaccion = () =>
    prisma.$transaction(async (tx) => {
      let asociado = await creditosRepository.buscarAsociado(
        tx,
        datos.identificacionAsociado,
        datos.tipoIdentificacionAsociado,
      );
      if (!asociado) {
        asociado = await creditosRepository.crearAsociado(tx, {
          tipoIdentificacion: datos.tipoIdentificacionAsociado,
          identificacion: datos.identificacionAsociado,
          nombre: datos.nombreAsociado,
        });
      } else if (
        !(await creditosRepository.nombreAsociadoCoincide(tx, asociado.id, datos.nombreAsociado))
      ) {
        // Protege contra un error de digitación que cargaría el crédito a otra persona.
        throw new AppError(
          'ASOCIADO_NOMBRE_NO_COINCIDE',
          'La identificación ya está registrada con otro nombre. Verifique la identificación y el nombre.',
        );
      }

      if (await creditosRepository.existeEnCurso(tx, asociado.id, datos.tipoCredito))
        throw duplicado();

      const id = await creditosRepository.insertar(tx, {
        asociadoId: asociado.id,
        tipoCredito: datos.tipoCredito,
        valorSolicitado: datos.valorSolicitado,
        tasaInteres: datos.tasaInteres,
        numeroCuotas: datos.numeroCuotas,
        formaPago: datos.formaPago,
      });
      // La creación es la primera fila del historial: NULL → SOLICITADO, con quién la registró.
      await creditosRepository.registrarCambioEstado(tx, {
        creditoId: id,
        estadoAnterior: null,
        estadoNuevo: 'SOLICITADO',
        observacion: null,
        usuarioId: actor.id,
        requestId: origen.requestId,
      });

      const credito = await creditosRepository.obtener(tx, id);
      if (!credito) throw new Error('El crédito recién creado no se pudo leer');

      // El evento del webhook entra al outbox en esta misma transacción: o se guardan el crédito y
      // el evento, o ninguno. El worker lo envía después (ADR 0006).
      await webhooksService.registrarCreditoCreado(tx, credito, origen.requestId);
      return credito;
    });

  // Una violación de índice único tiene dos orígenes posibles: el mismo asociado creado por dos
  // peticiones a la vez (se reintenta y ya existe), o el crédito duplicado (el reintento lo detecta).
  try {
    return await crearEnTransaccion();
  } catch (error) {
    if (!esViolacionUnica(error)) throw error;
    try {
      return await crearEnTransaccion();
    } catch (reintento) {
      if (esViolacionUnica(reintento)) throw duplicado();
      throw reintento;
    }
  }
}

// ───────────── Editar ─────────────

function valorActual(credito: Credito, campo: (typeof camposEditables)[number]): string {
  return String(credito[campo]);
}

export async function editar(
  id: string,
  datos: DatosEditarCredito,
  actor: UsuarioAutenticado,
  origen: OrigenPeticion,
): Promise<Credito> {
  const credito = await obtenerModificable(id);
  if (credito.estado !== 'SOLICITADO') {
    throw new AppError(
      'CREDITO_NO_EDITABLE',
      `Las condiciones solo se pueden editar en SOLICITADO; el crédito está ${credito.estado}`,
    );
  }
  await catalogosService.verificarCodigos({
    tipoCredito: datos.tipoCredito,
    formaPago: datos.formaPago,
  });

  // Solo lo que de verdad cambia: sin cambios no hay UPDATE, ni auditoría vacía, ni versión nueva.
  const cambios: Partial<Record<(typeof camposEditables)[number], string | number>> = {};
  for (const campo of camposEditables) {
    const nuevo = datos[campo];
    if (nuevo !== undefined && String(nuevo) !== valorActual(credito, campo))
      cambios[campo] = nuevo;
  }
  if (Object.keys(cambios).length === 0) return credito;

  try {
    return await prisma.$transaction(async (tx) => {
      if (
        cambios.tipoCredito !== undefined &&
        (await creditosRepository.existeEnCurso(
          tx,
          await asociadoDe(tx, id),
          String(cambios.tipoCredito),
          id,
        ))
      ) {
        throw duplicado();
      }

      const filas = await creditosRepository.actualizarCondiciones(tx, id, cambios, datos.version);
      if (filas === 0) throw modificado();

      const operacionId = randomUUID();
      await creditosRepository.registrarCambiosDatos(
        tx,
        Object.entries(cambios).map(([campo, valor]) => ({
          operacionId,
          creditoId: id,
          campo,
          valorAnterior: valorActual(credito, campo as (typeof camposEditables)[number]),
          valorNuevo: String(valor),
          motivo: datos.motivo ?? null,
          usuarioId: actor.id,
          requestId: origen.requestId,
        })),
      );

      const actualizado = await creditosRepository.obtener(tx, id);
      if (!actualizado) throw noEncontrado();
      return actualizado;
    });
  } catch (error) {
    if (esViolacionUnica(error)) throw duplicado();
    throw error;
  }
}

async function asociadoDe(tx: Prisma.TransactionClient, creditoId: string): Promise<string> {
  const fila = await tx.creditos.findUnique({
    where: { id: creditoId },
    select: { asociadoId: true },
  });
  if (!fila) throw noEncontrado();
  return fila.asociadoId;
}

// ───────────── Cambiar estado ─────────────

export async function cambiarEstado(
  id: string,
  datos: DatosCambiarEstado,
  actor: UsuarioAutenticado,
  origen: OrigenPeticion,
  ruta: string,
): Promise<Credito> {
  // El orden de las verificaciones está fijado en el ADR 0017: la primera que falla define la respuesta.
  const credito = await obtenerModificable(id);

  if (!puedeCambiarA(actor.rol, datos.estado)) {
    await denegar(
      actor,
      origen,
      ruta,
      `${actor.rol} no puede llevar un crédito a ${datos.estado}`,
      `Su rol no puede llevar un crédito a ${datos.estado}`,
    );
  }

  if (!puedeTransicionar(credito.estado, datos.estado)) {
    throw new AppError(
      'TRANSICION_INVALIDA',
      `Un crédito ${credito.estado} no puede pasar a ${datos.estado}`,
    );
  }

  // Cuatro ojos: quien registra no aprueba, y quien aprueba no desembolsa (ADR 0016).
  const actores = await creditosRepository.actoresDelCredito(prisma, id);
  if (datos.estado === 'APROBADO' && mismoUsuario(actores.registradoPor, actor.id)) {
    await denegar(
      actor,
      origen,
      ruta,
      'Cuatro ojos: quien registró el crédito intentó aprobarlo',
      'Quien registró el crédito no puede aprobarlo: debe hacerlo otro usuario',
    );
  }
  if (datos.estado === 'DESEMBOLSADO' && mismoUsuario(actores.aprobadoPor, actor.id)) {
    await denegar(
      actor,
      origen,
      ruta,
      'Cuatro ojos: quien aprobó el crédito intentó desembolsarlo',
      'Quien aprobó el crédito no puede desembolsarlo: debe hacerlo otro usuario',
    );
  }

  return prisma.$transaction(async (tx) => {
    const filas = await creditosRepository.actualizarEstado(tx, id, datos.estado, datos.version);
    if (filas === 0) throw modificado();

    await creditosRepository.registrarCambioEstado(tx, {
      creditoId: id,
      estadoAnterior: credito.estado,
      estadoNuevo: datos.estado,
      observacion: datos.observacion ?? null,
      usuarioId: actor.id,
      requestId: origen.requestId,
    });

    const actualizado = await creditosRepository.obtener(tx, id);
    if (!actualizado) throw noEncontrado();
    return actualizado;
  });
}

// ───────────── Eliminar ─────────────

export async function eliminar(
  id: string,
  datos: DatosEliminarCredito,
  actor: UsuarioAutenticado,
  origen: OrigenPeticion,
): Promise<void> {
  const credito = await obtenerModificable(id);
  if (credito.estado !== 'SOLICITADO') {
    throw new AppError(
      'CREDITO_NO_ELIMINABLE',
      `Solo se elimina un crédito SOLICITADO; este está ${credito.estado}. Use la cancelación.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    const fecha = await creditosRepository.eliminar(tx, id, actor.id, datos.version);
    if (!fecha) throw modificado();

    await creditosRepository.registrarCambiosDatos(tx, [
      {
        operacionId: randomUUID(),
        creditoId: id,
        campo: 'fechaEliminacion',
        valorAnterior: null,
        valorNuevo: fecha.toISOString(),
        motivo: datos.motivo,
        usuarioId: actor.id,
        requestId: origen.requestId,
      },
    ]);
  });
}
