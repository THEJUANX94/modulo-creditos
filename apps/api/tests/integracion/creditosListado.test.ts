import { esquemaCredito, esquemaResumenCreditos, type Credito } from '@creditos/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  bearer,
  cambiarEstado,
  crearCredito,
  exito,
  identificacionAleatoria,
  iniciarSesion,
  lista,
  type Sesion,
} from './apoyo/ayudas';

// Listado con filtros, búsqueda, orden y paginación, y el resumen del dashboard (ADR 0017).

let asesor: Sesion;
let tesoreria: Sesion;
const idJuan = identificacionAleatoria();
let libreInversion: Credito;

const listar = async (consulta: string) =>
  lista(
    await api()
      .get(`/api/creditos?${consulta}`)
      .set(...bearer(tesoreria.token)),
    esquemaCredito,
  );
const estadoDe = async (consulta: string) =>
  (
    await api()
      .get(`/api/creditos?${consulta}`)
      .set(...bearer(tesoreria.token))
  ).status;
const diaColombia = (fecha: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(fecha);

beforeAll(async () => {
  [asesor, tesoreria] = await Promise.all([iniciarSesion('ASESOR'), iniciarSesion('TESORERIA')]);
  const analista = await iniciarSesion('ANALISTA');
  // Juan: tres créditos (uno rechazado). Ana María Pérez: uno grande, para buscar por nombre.
  libreInversion = await crearCredito(asesor.token, { identificacionAsociado: idJuan });
  await cambiarEstado(analista.token, libreInversion, 'RECHAZADO', {
    observacion: 'Sin capacidad',
  });
  await crearCredito(asesor.token, {
    identificacionAsociado: idJuan,
    tipoCredito: 'EDUCATIVO',
    valorSolicitado: 2500000,
  });
  await crearCredito(asesor.token, {
    identificacionAsociado: idJuan,
    tipoCredito: 'VEHICULO',
    valorSolicitado: 40000000,
  });
  await crearCredito(asesor.token, {
    nombreAsociado: 'Ana María Pérez',
    valorSolicitado: 99000000,
  });
});

describe('filtros', () => {
  it('por identificación exacta y por varios estados', async () => {
    expect((await listar(`identificacion=${idJuan}`)).meta.total).toBe(3);
    const porEstados = await listar(`identificacion=${idJuan}&estado=SOLICITADO,RECHAZADO`);
    expect(porEstados.meta.total).toBe(3);
    expect(porEstados.data.every((c) => ['SOLICITADO', 'RECHAZADO'].includes(c.estado))).toBe(true);
    expect((await listar(`identificacion=${idJuan}&estado=RECHAZADO`)).meta.total).toBe(1);
  });

  it('por tipo de crédito y forma de pago', async () => {
    expect(
      (await listar(`identificacion=${idJuan}&tipoCredito=VEHICULO&formaPago=NOMINA`)).meta.total,
    ).toBe(1);
  });

  it('por rango de fechas en hora de Colombia: hoy los incluye, ayer no', async () => {
    const hoy = diaColombia(new Date());
    const ayer = diaColombia(new Date(Date.now() - 86_400_000));
    expect(
      (await listar(`identificacion=${idJuan}&fechaDesde=${hoy}&fechaHasta=${hoy}`)).meta.total,
    ).toBe(3);
    expect(
      (await listar(`identificacion=${idJuan}&fechaDesde=${ayer}&fechaHasta=${ayer}`)).meta.total,
    ).toBe(0);
  });

  it('filtros inválidos → 400', async () => {
    const hoy = diaColombia(new Date());
    const ayer = diaColombia(new Date(Date.now() - 86_400_000));
    expect(await estadoDe('ordenarPor=hashContrasena')).toBe(400);
    expect(await estadoDe('busqueda=a')).toBe(400);
    expect(await estadoDe(`fechaDesde=${hoy}&fechaHasta=${ayer}`)).toBe(400);
    expect(await estadoDe('estado=PAGADO')).toBe(400);
  });
});

describe('búsqueda', () => {
  it('sin tildes ni mayúsculas: "MARIA perez" encuentra a "Ana María Pérez"', async () => {
    const encontrados = await listar('busqueda=MARIA%20perez');
    expect(encontrados.data.some((c) => c.nombreAsociado === 'Ana María Pérez')).toBe(true);
  });

  it('por el final del número de crédito', async () => {
    const encontrados = await listar(`busqueda=${libreInversion.numeroCredito.slice(-6)}`);
    expect(encontrados.data.some((c) => c.id === libreInversion.id)).toBe(true);
  });

  it('"%%" y "__" se buscan como texto, no como comodines de LIKE', async () => {
    expect((await listar('busqueda=%25%25')).meta.total).toBe(0);
    expect((await listar('busqueda=__')).meta.total).toBe(0);
  });
});

describe('orden y paginación', () => {
  it('por valor ascendente', async () => {
    const valores = (
      await listar(`identificacion=${idJuan}&ordenarPor=valorSolicitado&orden=asc`)
    ).data.map((c) => Number(c.valorSolicitado));
    expect(valores).toEqual([...valores].sort((a, b) => a - b));
  });

  it('la página 2 de 3 elementos, con su meta', async () => {
    const pagina = await listar('pagina=2&tamanoPagina=3');
    expect(pagina.data).toHaveLength(3);
    expect(pagina.meta.pagina).toBe(2);
    expect(pagina.meta.totalPaginas).toBe(Math.ceil(pagina.meta.total / 3));
  });
});

describe('resumen del dashboard', () => {
  const leerResumen = async () =>
    exito(
      await api()
        .get('/api/creditos/resumen')
        .set(...bearer(tesoreria.token)),
      esquemaResumenCreditos,
    );

  // Todas las páginas del listado, para comparar con el resumen sin depender de cuántos créditos
  // crearon los demás archivos.
  async function todos(): Promise<Credito[]> {
    const creditos: Credito[] = [];
    for (let pagina = 1; ; pagina++) {
      const res = await listar(`pagina=${pagina}&tamanoPagina=100`);
      creditos.push(...res.data);
      if (pagina >= res.meta.totalPaginas) return creditos;
    }
  }
  const centavos = (monto: string) => Math.round(Number(monto) * 100);

  it('los totales coinciden con el listado, y están los 6 estados aunque estén en cero', async () => {
    const [resumen, creditos] = [await leerResumen(), await todos()];
    expect(Object.keys(resumen.porEstado)).toHaveLength(6);
    expect(resumen.total).toBe(creditos.length);
    expect(centavos(resumen.montoTotal)).toBe(
      creditos.reduce((suma, c) => suma + centavos(c.valorSolicitado), 0),
    );
    expect(Object.values(resumen.porEstado).reduce((suma, e) => suma + e.cantidad, 0)).toBe(
      resumen.total,
    );
  });

  it('un crédito nuevo suma exactamente su monto en SOLICITADO', async () => {
    const antes = await leerResumen();
    await crearCredito(asesor.token, { valorSolicitado: '1234567.89' });
    const despues = await leerResumen();
    expect(despues.total).toBe(antes.total + 1);
    expect(
      centavos(despues.porEstado.SOLICITADO.monto) - centavos(antes.porEstado.SOLICITADO.monto),
    ).toBe(123456789);
  });
});
