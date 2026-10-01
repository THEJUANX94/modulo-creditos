import {
  estadosEnCurso,
  type CampoEditable,
  type Credito,
  type EstadoCredito,
  type FiltrosCreditos,
} from '@creditos/shared';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../shared/db/prisma';

// Lecturas con el cliente tipado de Prisma. La versión (ROWVERSION) y todas las escrituras de
// Creditos van con SQL parametrizado, porque Prisma no soporta ROWVERSION ni la columna calculada
// numeroCredito (ADR 0003). Cada ${valor} viaja como parámetro.

type ClienteBd = Prisma.TransactionClient | typeof prisma;

const relaciones = {
  Asociados: { select: { tipoIdentificacion: true, identificacion: true, nombre: true } },
  // Quién eliminó (relación por usuarioEliminacionId) y con qué motivo.
  Usuarios: { select: { nombre: true } },
  CambiosCredito: {
    where: { campo: 'fechaEliminacion' },
    select: { motivo: true },
    orderBy: { id: 'desc' },
    take: 1,
  },
} satisfies Prisma.CreditosInclude;

type FilaCredito = Prisma.CreditosGetPayload<{ include: typeof relaciones }>;

function aCredito(fila: FilaCredito, version: string): Credito {
  const credito: Credito = {
    id: fila.id.toLowerCase(),
    numeroCredito: fila.numeroCredito,
    tipoIdentificacionAsociado: fila.Asociados.tipoIdentificacion,
    identificacionAsociado: fila.Asociados.identificacion,
    nombreAsociado: fila.Asociados.nombre,
    tipoCredito: fila.tipoCredito,
    valorSolicitado: fila.valorSolicitado.toFixed(2),
    tasaInteres: fila.tasaInteres.toFixed(4),
    numeroCuotas: fila.numeroCuotas,
    formaPago: fila.formaPago,
    estado: fila.estado as EstadoCredito,
    fechaSolicitud: fila.fechaSolicitud.toISOString(),
    fechaActualizacion: fila.fechaActualizacion.toISOString(),
    version,
  };
  if (fila.fechaEliminacion) {
    credito.eliminacion = {
      fecha: fila.fechaEliminacion.toISOString(),
      usuarioNombre: fila.Usuarios?.nombre ?? '(desconocido)',
      motivo: fila.CambiosCredito[0]?.motivo ?? null,
    };
  }
  return credito;
}

async function versiones(cliente: ClienteBd, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const filas = await cliente.$queryRaw<{ id: string; version: string }[]>`
    SELECT id, CONVERT(NVARCHAR(18), CONVERT(BINARY(8), version), 1) AS version
    FROM dbo.Creditos
    WHERE id IN (${Prisma.join(ids)})`;
  return new Map(filas.map((fila) => [fila.id.toLowerCase(), fila.version]));
}

// ───────────── Lecturas ─────────────

export async function obtener(cliente: ClienteBd, id: string): Promise<Credito | null> {
  const fila = await cliente.creditos.findUnique({ where: { id }, include: relaciones });
  if (!fila) return null;
  const version = (await versiones(cliente, [fila.id])).get(fila.id.toLowerCase()) ?? '';
  return aCredito(fila, version);
}

// Días calendario en hora de Colombia (UTC−5 fijo) → instantes UTC: [desde 05:00, hasta+1 05:00).
function inicioDiaColombia(fecha: string, diasExtra = 0): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(anio, mes - 1, dia + diasExtra, 5, 0, 0));
}

const ordenes = {
  fechaSolicitud: (orden: Prisma.SortOrder) => ({ fechaSolicitud: orden }),
  valorSolicitado: (orden: Prisma.SortOrder) => ({ valorSolicitado: orden }),
  numeroCredito: (orden: Prisma.SortOrder) => ({ numeroCredito: orden }),
  nombreAsociado: (orden: Prisma.SortOrder) => ({ Asociados: { nombre: orden } }),
  estado: (orden: Prisma.SortOrder) => ({ estado: orden }),
} satisfies Record<
  FiltrosCreditos['ordenarPor'],
  (orden: Prisma.SortOrder) => Prisma.CreditosOrderByWithRelationInput
>;

// Prisma no escapa los comodines de LIKE en SQL Server: sin esto, buscar "%" coincide con todo.
// Se escapan con corchetes, la sintaxis de SQL Server ([%] es un % literal).
function escaparLike(texto: string): string {
  return texto.replace(/[[%_]/g, (caracter) => `[${caracter}]`);
}

export async function listar(
  filtros: FiltrosCreditos,
): Promise<{ creditos: Credito[]; total: number }> {
  const busqueda = filtros.busqueda && escaparLike(filtros.busqueda);
  const where: Prisma.CreditosWhereInput = {
    ...(!filtros.incluirEliminados && { fechaEliminacion: null }),
    ...(filtros.estado && { estado: { in: filtros.estado } }),
    ...(filtros.identificacion && { Asociados: { identificacion: filtros.identificacion } }),
    ...(filtros.tipoCredito && { tipoCredito: filtros.tipoCredito }),
    ...(filtros.formaPago && { formaPago: filtros.formaPago }),
    ...((filtros.fechaDesde ?? filtros.fechaHasta) && {
      fechaSolicitud: {
        ...(filtros.fechaDesde && { gte: inicioDiaColombia(filtros.fechaDesde) }),
        ...(filtros.fechaHasta && { lt: inicioDiaColombia(filtros.fechaHasta, 1) }),
      },
    }),
    // "Contiene", sin distinguir mayúsculas ni tildes gracias a la collation Modern_Spanish_CI_AI.
    ...(busqueda && {
      OR: [
        { numeroCredito: { contains: busqueda } },
        { Asociados: { identificacion: { contains: busqueda } } },
        { Asociados: { nombre: { contains: busqueda } } },
      ],
    }),
  };

  const [filas, total] = await prisma.$transaction([
    prisma.creditos.findMany({
      where,
      include: relaciones,
      // El consecutivo desempata, para que la paginación sea estable.
      orderBy: [ordenes[filtros.ordenarPor](filtros.orden), { consecutivo: filtros.orden }],
      skip: (filtros.pagina - 1) * filtros.tamanoPagina,
      take: filtros.tamanoPagina,
    }),
    prisma.creditos.count({ where }),
  ]);

  const mapaVersiones = await versiones(
    prisma,
    filas.map((fila) => fila.id),
  );
  return {
    creditos: filas.map((fila) => aCredito(fila, mapaVersiones.get(fila.id.toLowerCase()) ?? '')),
    total,
  };
}

export async function totalesPorEstado(): Promise<
  { estado: EstadoCredito; cantidad: number; monto: Prisma.Decimal | null }[]
> {
  const grupos = await prisma.creditos.groupBy({
    by: ['estado'],
    where: { fechaEliminacion: null },
    _count: { _all: true },
    _sum: { valorSolicitado: true },
  });
  return grupos.map((grupo) => ({
    estado: grupo.estado as EstadoCredito,
    cantidad: grupo._count._all,
    monto: grupo._sum.valorSolicitado,
  }));
}

// Quién registró el crédito (primera fila del historial) y quién lo aprobó: para los cuatro ojos.
export async function actoresDelCredito(
  cliente: ClienteBd,
  creditoId: string,
): Promise<{ registradoPor: string | null; aprobadoPor: string | null }> {
  const [creacion, aprobacion] = await Promise.all([
    cliente.historialCredito.findFirst({
      where: { creditoId, estadoAnterior: null },
      select: { usuarioId: true },
    }),
    cliente.historialCredito.findFirst({
      where: { creditoId, estadoNuevo: 'APROBADO' },
      select: { usuarioId: true },
      orderBy: { id: 'desc' },
    }),
  ]);
  return {
    registradoPor: creacion?.usuarioId.toLowerCase() ?? null,
    aprobadoPor: aprobacion?.usuarioId.toLowerCase() ?? null,
  };
}

export async function obtenerHistorial(creditoId: string) {
  const [estados, cambios] = await Promise.all([
    prisma.historialCredito.findMany({
      where: { creditoId },
      select: {
        estadoAnterior: true,
        estadoNuevo: true,
        observacion: true,
        fecha: true,
        Usuarios: { select: { id: true, nombre: true } },
      },
    }),
    prisma.cambiosCredito.findMany({
      where: { creditoId },
      select: {
        id: true,
        operacionId: true,
        campo: true,
        valorAnterior: true,
        valorNuevo: true,
        motivo: true,
        fecha: true,
        Usuarios: { select: { id: true, nombre: true } },
      },
      orderBy: { id: 'asc' },
    }),
  ]);
  return { estados, cambios };
}

// ───────────── Asociados ─────────────

export async function buscarAsociado(
  cliente: ClienteBd,
  identificacion: string,
  tipoIdentificacion: string,
): Promise<{ id: string } | null> {
  return cliente.asociados.findUnique({
    where: { identificacion_tipoIdentificacion: { identificacion, tipoIdentificacion } },
    select: { id: true },
  });
}

// La BD compara con su collation: no distingue mayúsculas ni tildes ("juan perez" = "Juan Pérez").
export async function nombreAsociadoCoincide(
  cliente: ClienteBd,
  asociadoId: string,
  nombre: string,
): Promise<boolean> {
  const fila = await cliente.asociados.findFirst({
    where: { id: asociadoId, nombre },
    select: { id: true },
  });
  return fila !== null;
}

export async function crearAsociado(
  cliente: ClienteBd,
  datos: { tipoIdentificacion: string; identificacion: string; nombre: string },
): Promise<{ id: string }> {
  return cliente.asociados.create({ data: datos, select: { id: true } });
}

// Verificación previa de la regla de duplicados, para dar un mensaje claro. La garantía, aun con
// peticiones simultáneas, es el índice único filtrado UX_Creditos_enCurso.
export async function existeEnCurso(
  cliente: ClienteBd,
  asociadoId: string,
  tipoCredito: string,
  excluirId?: string,
): Promise<boolean> {
  const fila = await cliente.creditos.findFirst({
    where: {
      asociadoId,
      tipoCredito,
      estado: { in: [...estadosEnCurso] },
      fechaEliminacion: null,
      ...(excluirId && { NOT: { id: excluirId } }),
    },
    select: { id: true },
  });
  return fila !== null;
}

// ───────────── Escrituras de Creditos (SQL directo) ─────────────

export async function insertar(
  tx: Prisma.TransactionClient,
  datos: {
    asociadoId: string;
    tipoCredito: string;
    valorSolicitado: string;
    tasaInteres: string;
    numeroCuotas: number;
    formaPago: string;
  },
): Promise<string> {
  const [fila] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO dbo.Creditos (asociadoId, tipoCredito, valorSolicitado, tasaInteres, numeroCuotas, formaPago)
    OUTPUT INSERTED.id
    VALUES (${datos.asociadoId}, ${datos.tipoCredito}, CAST(${datos.valorSolicitado} AS DECIMAL(18, 2)),
            CAST(${datos.tasaInteres} AS DECIMAL(6, 4)), ${datos.numeroCuotas}, ${datos.formaPago})`;
  if (!fila) throw new Error('El INSERT de Creditos no devolvió el id');
  return fila.id.toLowerCase();
}

const condicionVersion = (version: string) =>
  Prisma.sql`version = CONVERT(BINARY(8), ${version}, 1)`;

// Devuelve cuántas filas cambió: 0 si la versión ya no coincide (otro usuario lo modificó).
export async function actualizarEstado(
  tx: Prisma.TransactionClient,
  id: string,
  estado: EstadoCredito,
  version: string,
): Promise<number> {
  return tx.$executeRaw`
    UPDATE dbo.Creditos
    SET estado = ${estado}, fechaActualizacion = SYSUTCDATETIME()
    WHERE id = ${id} AND fechaEliminacion IS NULL AND ${condicionVersion(version)}`;
}

// Solo columnas de una lista cerrada: el nombre de la columna nunca sale de la entrada del usuario.
const asignaciones: Record<CampoEditable, (valor: string | number) => Prisma.Sql> = {
  tipoCredito: (valor) => Prisma.sql`tipoCredito = ${valor}`,
  valorSolicitado: (valor) => Prisma.sql`valorSolicitado = CAST(${valor} AS DECIMAL(18, 2))`,
  tasaInteres: (valor) => Prisma.sql`tasaInteres = CAST(${valor} AS DECIMAL(6, 4))`,
  numeroCuotas: (valor) => Prisma.sql`numeroCuotas = ${valor}`,
  formaPago: (valor) => Prisma.sql`formaPago = ${valor}`,
};

export async function actualizarCondiciones(
  tx: Prisma.TransactionClient,
  id: string,
  cambios: Partial<Record<CampoEditable, string | number>>,
  version: string,
): Promise<number> {
  const sets = Object.entries(cambios).map(([campo, valor]) =>
    asignaciones[campo as CampoEditable](valor),
  );
  return tx.$executeRaw`
    UPDATE dbo.Creditos
    SET ${Prisma.join(sets, ', ')}, fechaActualizacion = SYSUTCDATETIME()
    WHERE id = ${id} AND estado = N'SOLICITADO' AND fechaEliminacion IS NULL
      AND ${condicionVersion(version)}`;
}

// Borrado lógico. Devuelve la fecha registrada, o null si la versión ya no coincide.
export async function eliminar(
  tx: Prisma.TransactionClient,
  id: string,
  usuarioId: string,
  version: string,
): Promise<Date | null> {
  const filas = await tx.$queryRaw<{ fechaEliminacion: Date }[]>`
    UPDATE dbo.Creditos
    SET fechaEliminacion = SYSUTCDATETIME(), usuarioEliminacionId = ${usuarioId},
        fechaActualizacion = SYSUTCDATETIME()
    OUTPUT INSERTED.fechaEliminacion
    WHERE id = ${id} AND estado = N'SOLICITADO' AND fechaEliminacion IS NULL
      AND ${condicionVersion(version)}`;
  return filas[0]?.fechaEliminacion ?? null;
}

// ───────────── Auditoría ─────────────

export async function registrarCambioEstado(
  tx: Prisma.TransactionClient,
  datos: {
    creditoId: string;
    estadoAnterior: EstadoCredito | null;
    estadoNuevo: EstadoCredito;
    observacion: string | null;
    usuarioId: string;
    requestId: string | null;
  },
): Promise<void> {
  await tx.historialCredito.create({ data: datos });
}

export async function registrarCambiosDatos(
  tx: Prisma.TransactionClient,
  filas: {
    operacionId: string;
    creditoId: string;
    campo: string;
    valorAnterior: string | null;
    valorNuevo: string | null;
    motivo: string | null;
    usuarioId: string;
    requestId: string | null;
  }[],
): Promise<void> {
  await tx.cambiosCredito.createMany({ data: filas });
}
