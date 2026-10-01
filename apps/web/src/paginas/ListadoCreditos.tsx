import {
  esquemaFiltrosCreditos,
  estadosCredito,
  puede,
  type Credito,
  type FiltrosCreditos,
} from '@creditos/shared';
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EstadoBadge } from '@/components/EstadoBadge';
import { Cargando, Encabezado, ErrorCarga, Paginacion, SinDatos } from '@/components/Estados';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useCatalogos, useCreditos } from '@/lib/consultas';
import { nombresEstado } from '@/lib/estados';
import { formatearFecha, formatearMonto } from '@/lib/formatos';
import { useUsuario } from '@/lib/sesion';

// Listado (enunciado: tabla con crédito, asociado, valor, tipo, estado y fecha; búsqueda, filtros
// y paginación). Los filtros viven en la URL y se validan con el mismo esquema que usa la API: un
// listado filtrado se puede recargar o compartir (ADR 0021).

type Orden = FiltrosCreditos['ordenarPor'];
const todos = 'todos';
const sinCreditos: Credito[] = [];
const features = tableFeatures({});
const columna = createColumnHelper<typeof features, Credito>();

function useFiltros() {
  const [parametros, setParametros] = useSearchParams();
  const filtros = useMemo(() => {
    const leidos = esquemaFiltrosCreditos.safeParse(Object.fromEntries(parametros));
    return leidos.success ? leidos.data : esquemaFiltrosCreditos.parse({});
  }, [parametros]);

  // Cambiar un filtro vuelve a la página 1; cambiar de página conserva los filtros.
  const cambiar = useCallback(
    (cambios: Record<string, string | undefined>) =>
      setParametros((actuales) => {
        const nuevos = new URLSearchParams(actuales);
        for (const [nombre, valor] of Object.entries(cambios)) {
          if (valor === undefined || valor === '') nuevos.delete(nombre);
          else nuevos.set(nombre, valor);
        }
        if (!('pagina' in cambios)) nuevos.delete('pagina');
        return nuevos;
      }),
    [setParametros],
  );
  return {
    filtros,
    cambiar,
    hayFiltros: [...parametros.keys()].some((clave) => clave !== 'pagina'),
  };
}

function EncabezadoOrdenable({
  titulo,
  campo,
  filtros,
  cambiar,
}: {
  titulo: string;
  campo: Orden;
  filtros: FiltrosCreditos;
  cambiar: (cambios: Record<string, string | undefined>) => void;
}) {
  const activo = filtros.ordenarPor === campo;
  const Icono = !activo ? ArrowUpDown : filtros.orden === 'asc' ? ArrowUp : ArrowDown;
  const siguiente = activo && filtros.orden === 'desc' ? 'asc' : 'desc';
  return (
    <button
      type="button"
      className="inline-flex min-h-10 items-center gap-1 font-medium hover:text-foreground"
      onClick={() => cambiar({ ordenarPor: campo, orden: siguiente })}
    >
      {titulo}
      <Icono className="size-4" aria-hidden="true" />
      <span className="sr-only">
        {activo
          ? `, ordenado ${filtros.orden === 'asc' ? 'ascendente' : 'descendente'}`
          : ', ordenar'}
      </span>
    </button>
  );
}

export function ListadoCreditos() {
  const usuario = useUsuario();
  const { filtros, cambiar, hayFiltros } = useFiltros();
  const { data, isPending, error, refetch, isFetching } = useCreditos(filtros);
  const { data: catalogos } = useCatalogos();

  // La búsqueda se aplica al dejar de escribir (400 ms), y solo desde 2 caracteres.
  const [busqueda, setBusqueda] = useState(filtros.busqueda ?? '');
  useEffect(() => {
    const espera = setTimeout(() => {
      const texto = busqueda.trim();
      if (texto.length !== 1 && texto !== (filtros.busqueda ?? '')) cambiar({ busqueda: texto });
    }, 400);
    return () => clearTimeout(espera);
  }, [busqueda, filtros.busqueda, cambiar]);

  // Columnas estables entre renders (TanStack Table): solo cambian con el orden o los catálogos.
  const columnas = useMemo(() => {
    const ordenable = (titulo: string, campo: Orden) => () => (
      <EncabezadoOrdenable titulo={titulo} campo={campo} filtros={filtros} cambiar={cambiar} />
    );
    return columna.columns([
      columna.accessor('numeroCredito', {
        header: ordenable('Crédito', 'numeroCredito'),
        cell: (celda) => (
          <Link
            to={`/creditos/${celda.row.original.id}`}
            className="font-medium text-enlace underline-offset-4 hover:underline"
          >
            {celda.getValue()}
          </Link>
        ),
      }),
      columna.accessor('nombreAsociado', {
        header: ordenable('Asociado', 'nombreAsociado'),
        cell: (celda) => (
          <div>
            <div>{celda.getValue()}</div>
            <div className="text-sm text-muted-foreground">
              {celda.row.original.tipoIdentificacionAsociado}{' '}
              {celda.row.original.identificacionAsociado}
            </div>
          </div>
        ),
      }),
      columna.accessor('valorSolicitado', {
        header: ordenable('Valor', 'valorSolicitado'),
        cell: (celda) => <span className="tabular-nums">{formatearMonto(celda.getValue())}</span>,
      }),
      columna.accessor('tipoCredito', {
        header: 'Tipo',
        cell: (celda) =>
          catalogos?.tiposCredito.find((t) => t.codigo === celda.getValue())?.nombre ??
          celda.getValue(),
      }),
      columna.accessor('estado', {
        header: ordenable('Estado', 'estado'),
        cell: (celda) => <EstadoBadge estado={celda.getValue()} />,
      }),
      columna.accessor('fechaSolicitud', {
        header: ordenable('Fecha', 'fechaSolicitud'),
        cell: (celda) => formatearFecha(celda.getValue()),
      }),
    ]);
  }, [filtros, cambiar, catalogos]);
  const tabla = useTable({ features, columns: columnas, data: data?.datos ?? sinCreditos });

  const sortDe = (id: string) =>
    filtros.ordenarPor === id ? (filtros.orden === 'asc' ? 'ascending' : 'descending') : undefined;

  return (
    <>
      <Encabezado
        titulo="Créditos"
        descripcion="Solicitudes de crédito de los asociados."
        acciones={
          puede(usuario.rol, 'crearCredito') && (
            <Button asChild>
              <Link to="/creditos/nuevo">
                <Plus aria-hidden="true" /> Nuevo crédito
              </Link>
            </Button>
          )
        }
      />

      <search className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <Label htmlFor="busqueda">Buscar</Label>
          <Input
            id="busqueda"
            type="search"
            placeholder="Número, identificación o nombre"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-estado">Estado</Label>
          <Select
            value={filtros.estado?.[0] ?? todos}
            onValueChange={(valor) => cambiar({ estado: valor === todos ? undefined : valor })}
          >
            <SelectTrigger id="filtro-estado" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={todos}>Todos</SelectItem>
              {estadosCredito.map((estado) => (
                <SelectItem key={estado} value={estado}>
                  {nombresEstado[estado]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-tipo">Tipo de crédito</Label>
          <Select
            value={filtros.tipoCredito ?? todos}
            onValueChange={(valor) => cambiar({ tipoCredito: valor === todos ? undefined : valor })}
          >
            <SelectTrigger id="filtro-tipo" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={todos}>Todos</SelectItem>
              {catalogos?.tiposCredito.map((tipo) => (
                <SelectItem key={tipo.codigo} value={tipo.codigo}>
                  {tipo.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:col-span-1 lg:grid-cols-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="desde">Desde</Label>
            <Input
              id="desde"
              type="date"
              value={filtros.fechaDesde ?? ''}
              onChange={(e) => cambiar({ fechaDesde: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hasta">Hasta</Label>
            <Input
              id="hasta"
              type="date"
              value={filtros.fechaHasta ?? ''}
              onChange={(e) => cambiar({ fechaHasta: e.target.value })}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-5">
          {puede(usuario.rol, 'verEliminados') && (
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={filtros.incluirEliminados}
                onChange={(e) =>
                  cambiar({ incluirEliminados: e.target.checked ? 'true' : undefined })
                }
              />
              Incluir eliminados
            </label>
          )}
          {hayFiltros && (
            <Button
              variant="ghost"
              onClick={() => {
                setBusqueda('');
                cambiar({
                  busqueda: undefined,
                  estado: undefined,
                  tipoCredito: undefined,
                  fechaDesde: undefined,
                  fechaHasta: undefined,
                  incluirEliminados: undefined,
                  ordenarPor: undefined,
                  orden: undefined,
                });
              }}
            >
              <X aria-hidden="true" /> Limpiar filtros
            </Button>
          )}
          <p className="ml-auto text-sm text-muted-foreground" aria-live="polite">
            {isFetching && !isPending ? 'Actualizando…' : data ? `${data.meta.total} créditos` : ''}
          </p>
        </div>
      </search>

      {isPending ? (
        <Cargando filas={6} etiqueta="Cargando créditos…" />
      ) : error ? (
        <ErrorCarga error={error} reintentar={() => void refetch()} />
      ) : data.datos.length === 0 ? (
        <SinDatos
          titulo={
            hayFiltros ? 'Ningún crédito coincide con los filtros' : 'Todavía no hay créditos'
          }
          texto={
            hayFiltros
              ? 'Pruebe con otra búsqueda o limpie los filtros.'
              : 'Cuando se registre una solicitud, aparecerá aquí.'
          }
          accion={
            !hayFiltros &&
            puede(usuario.rol, 'crearCredito') && (
              <Button asChild>
                <Link to="/creditos/nuevo">Registrar el primero</Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* Escritorio: tabla. */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                {tabla.getHeaderGroups().map((grupo) => (
                  <TableRow key={grupo.id}>
                    {grupo.headers.map((encabezado) => (
                      <TableHead key={encabezado.id} aria-sort={sortDe(encabezado.column.id)}>
                        <tabla.FlexRender header={encabezado} />
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {tabla.getRowModel().rows.map((fila) => (
                  <TableRow
                    key={fila.id}
                    className={fila.original.eliminacion ? 'opacity-70' : undefined}
                  >
                    {fila.getAllCells().map((celda) => (
                      <TableCell key={celda.id}>
                        <tabla.FlexRender cell={celda} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Móvil: tarjetas, sin scroll horizontal. */}
          <ul className="flex flex-col gap-3 md:hidden">
            {data.datos.map((credito) => (
              <li key={credito.id}>
                <Link
                  to={`/creditos/${credito.id}`}
                  className="block rounded-xl border bg-card p-4 transition-colors hover:bg-accent"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-enlace">{credito.numeroCredito}</span>
                    <EstadoBadge estado={credito.estado} />
                  </div>
                  <p className="mt-2">{credito.nombreAsociado}</p>
                  <div className="mt-1 flex justify-between text-sm text-muted-foreground">
                    <span className="tabular-nums">{formatearMonto(credito.valorSolicitado)}</span>
                    <span>{formatearFecha(credito.fechaSolicitud)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <Paginacion
            pagina={data.meta.pagina}
            totalPaginas={data.meta.totalPaginas}
            total={data.meta.total}
            cambiar={(pagina) => cambiar({ pagina: String(pagina) })}
          />
        </>
      )}
    </>
  );
}
