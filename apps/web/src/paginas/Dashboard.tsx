import { estadosCredito, puede, type ResumenCreditos } from '@creditos/shared';
import { Plus } from 'lucide-react';
import { Link } from 'react-router';
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from 'recharts';
import { EstadoBadge } from '@/components/EstadoBadge';
import { Cargando, Encabezado, ErrorCarga } from '@/components/Estados';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useResumen } from '@/lib/consultas';
import { nombresEstado } from '@/lib/estados';
import { formatearMonto } from '@/lib/formatos';
import { useUsuario } from '@/lib/sesion';

// Dashboard (enunciado: total de créditos y cantidades por estado). Barras horizontales para
// comparar categorías, como recomienda la skill, en el orden del flujo y con el valor escrito en
// cada barra; debajo, la misma información en tabla, que es su alternativa accesible (ADR 0021).

const colorEstado = {
  SOLICITADO: 'var(--estado-solicitado)',
  EN_ESTUDIO: 'var(--estado-en-estudio)',
  APROBADO: 'var(--estado-aprobado)',
  DESEMBOLSADO: 'var(--estado-desembolsado)',
  RECHAZADO: 'var(--estado-rechazado)',
  CANCELADO: 'var(--estado-cancelado)',
} as const;

const configuracion: ChartConfig = { cantidad: { label: 'Créditos' } };

function Grafico({ resumen }: { resumen: ResumenCreditos }) {
  const datos = estadosCredito.map((estado) => ({
    estado,
    nombre: nombresEstado[estado],
    cantidad: resumen.porEstado[estado].cantidad,
  }));
  const descripcion = datos.map((d) => `${d.nombre}: ${d.cantidad}`).join(', ');
  return (
    <figure role="img" aria-label={`Créditos por estado. ${descripcion}.`}>
      <ChartContainer config={configuracion} className="aspect-auto h-72 w-full">
        <BarChart data={datos} layout="vertical" margin={{ left: 8, right: 48 }}>
          <YAxis type="category" dataKey="nombre" width={110} tickLine={false} axisLine={false} />
          <XAxis type="number" hide allowDecimals={false} />
          <Bar dataKey="cantidad" radius={6} minPointSize={3} isAnimationActive={false}>
            {datos.map((d) => (
              <Cell key={d.estado} fill={colorEstado[d.estado]} />
            ))}
            <LabelList dataKey="cantidad" position="right" className="fill-foreground text-sm" />
          </Bar>
        </BarChart>
      </ChartContainer>
    </figure>
  );
}

export function Dashboard() {
  const usuario = useUsuario();
  const { data: resumen, isPending, error, refetch } = useResumen();

  return (
    <>
      <Encabezado
        titulo="Dashboard"
        descripcion="Créditos por estado, sin contar los eliminados."
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
      {isPending ? (
        <Cargando filas={5} etiqueta="Cargando el resumen…" />
      ) : error ? (
        <ErrorCarga error={error} reintentar={() => void refetch()} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardDescription>Créditos</CardDescription>
                <CardTitle className="text-3xl font-semibold tabular-nums">
                  {resumen.total}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Monto total solicitado</CardDescription>
                <CardTitle className="text-3xl font-semibold tabular-nums text-dorado">
                  {formatearMonto(resumen.montoTotal)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2 className="text-lg">Créditos por estado</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Grafico resumen={resumen} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2 className="text-lg">Detalle por estado</h2>
              </CardTitle>
              <CardDescription>Cada estado abre el listado filtrado.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Créditos</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {estadosCredito.map((estado) => (
                    <TableRow key={estado}>
                      <TableCell>
                        <Link
                          to={`/creditos?estado=${estado}`}
                          className="rounded-full"
                          aria-label={`Ver los créditos en estado ${nombresEstado[estado]}`}
                        >
                          <EstadoBadge estado={estado} />
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">
                        {resumen.porEstado[estado].cantidad}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatearMonto(resumen.porEstado[estado].monto)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
