import { esquemaCredito, esquemaEntradaHistorial, type Credito } from '@creditos/shared';
import { z } from 'zod';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  bearer,
  camposConError,
  cambiarEstado,
  crearCredito,
  exito,
  fallo,
  identificacionAleatoria,
  iniciarSesion,
  lista,
  pedirCambioEstado,
  type Sesion,
} from './apoyo/ayudas';

// Mínimos del enunciado: cambio de estado y transiciones inválidas. Además: edición con
// concurrencia optimista, cuatro ojos, historial y eliminación lógica (ADR 0014, ADR 0016).

let asesor: Sesion;
let analista: Sesion;
let tesoreria: Sesion;
let admin: Sesion;

beforeAll(async () => {
  [asesor, analista, tesoreria, admin] = await Promise.all([
    iniciarSesion('ASESOR'),
    iniciarSesion('ANALISTA'),
    iniciarSesion('TESORERIA'),
    iniciarSesion('ADMIN'),
  ]);
});

const editar = (token: string, credito: Credito, cambios: Record<string, unknown>) =>
  api()
    .patch(`/api/creditos/${credito.id}`)
    .set(...bearer(token))
    .send({ version: credito.version, ...cambios });
const eliminar = (token: string, credito: Credito, cuerpo: Record<string, unknown>) =>
  api()
    .delete(`/api/creditos/${credito.id}`)
    .set(...bearer(token))
    .send({ version: credito.version, ...cuerpo });
const historial = async (token: string, credito: Credito) =>
  exito(
    await api()
      .get(`/api/creditos/${credito.id}/historial`)
      .set(...bearer(token)),
    z.array(esquemaEntradaHistorial),
  );

// Un crédito que atraviesa todo el flujo: edición, estudio y rechazo.
describe('edición y estados de un mismo crédito', () => {
  const identificacion = identificacionAleatoria();
  let actual: Credito;

  beforeAll(async () => {
    actual = await crearCredito(asesor.token, { identificacionAsociado: identificacion });
    await crearCredito(asesor.token, {
      identificacionAsociado: identificacion,
      tipoCredito: 'VEHICULO',
    });
  });

  it('editar valor y cuotas → 200 con versión nueva', async () => {
    const res = await editar(asesor.token, actual, {
      valorSolicitado: 12000000,
      numeroCuotas: 24,
      motivo: 'El asociado redujo el monto',
    });
    const editado = exito(res, esquemaCredito);
    expect(editado).toMatchObject({ valorSolicitado: '12000000.00', numeroCuotas: 24 });
    expect(editado.version).not.toBe(actual.version);

    const vieja = await editar(asesor.token, actual, { numeroCuotas: 12 });
    expect(vieja.status).toBe(409);
    expect(fallo(vieja).code).toBe('CREDITO_MODIFICADO');
    actual = editado;
  });

  it('sin cambios reales → 200 y la versión no cambia; sin campos → 400', async () => {
    expect(
      exito(await editar(asesor.token, actual, { numeroCuotas: 24 }), esquemaCredito).version,
    ).toBe(actual.version);
    expect((await editar(asesor.token, actual, {})).status).toBe(400);
  });

  it('cambiar a un tipo que ya está en curso → 409 CREDITO_DUPLICADO; ANALISTA no edita → 403', async () => {
    expect(fallo(await editar(asesor.token, actual, { tipoCredito: 'VEHICULO' })).code).toBe(
      'CREDITO_DUPLICADO',
    );
    expect((await editar(analista.token, actual, { numeroCuotas: 12 })).status).toBe(403);
  });

  it('ASESOR no lleva a EN_ESTUDIO → 403; DESEMBOLSADO desde SOLICITADO → 409 TRANSICION_INVALIDA', async () => {
    expect((await pedirCambioEstado(asesor.token, actual, 'EN_ESTUDIO')).status).toBe(403);
    const res = await pedirCambioEstado(tesoreria.token, actual, 'DESEMBOLSADO');
    expect(res.status).toBe(409);
    expect(fallo(res).code).toBe('TRANSICION_INVALIDA');
  });

  it('ANALISTA → EN_ESTUDIO → 200; con la versión vieja → 409 CREDITO_MODIFICADO', async () => {
    const enEstudio = await cambiarEstado(analista.token, actual, 'EN_ESTUDIO');
    expect(enEstudio.estado).toBe('EN_ESTUDIO');
    expect(fallo(await pedirCambioEstado(analista.token, actual, 'APROBADO')).code).toBe(
      'CREDITO_MODIFICADO',
    );
    actual = enEstudio;
  });

  it('fuera de SOLICITADO no se edita ni se elimina → 409', async () => {
    expect(fallo(await editar(asesor.token, actual, { numeroCuotas: 12 })).code).toBe(
      'CREDITO_NO_EDITABLE',
    );
    expect(fallo(await eliminar(asesor.token, actual, { motivo: 'x' })).code).toBe(
      'CREDITO_NO_ELIMINABLE',
    );
  });

  it('RECHAZADO exige observación; con ella → 200', async () => {
    expect(camposConError(await pedirCambioEstado(analista.token, actual, 'RECHAZADO'))).toEqual([
      'observacion',
    ]);
    actual = await cambiarEstado(analista.token, actual, 'RECHAZADO', {
      observacion: 'Capacidad de pago insuficiente',
    });
    expect(actual.estado).toBe('RECHAZADO');
  });

  it('RECHAZADO → DESEMBOLSADO, el ejemplo del enunciado → 409 TRANSICION_INVALIDA', async () => {
    const res = await pedirCambioEstado(tesoreria.token, actual, 'DESEMBOLSADO');
    expect(res.status).toBe(409);
    expect(fallo(res).code).toBe('TRANSICION_INVALIDA');
  });

  it('el historial va de lo más reciente a lo más antiguo, con quién, cuándo y por qué', async () => {
    const entradas = await historial(tesoreria.token, actual);
    expect(entradas.map((e) => (e.tipo === 'ESTADO' ? `ESTADO:${e.estadoNuevo}` : e.tipo))).toEqual(
      ['ESTADO:RECHAZADO', 'ESTADO:EN_ESTUDIO', 'EDICION', 'ESTADO:SOLICITADO'],
    );
    const [rechazo] = entradas;
    expect(rechazo).toMatchObject({
      observacion: 'Capacidad de pago insuficiente',
      usuario: { nombre: 'Analista Demo' },
    });
    const edicion = entradas.find((e) => e.tipo === 'EDICION');
    expect(edicion).toMatchObject({
      motivo: 'El asociado redujo el monto',
      usuario: { nombre: 'Asesor Demo' },
    });
    expect(edicion?.tipo === 'EDICION' && edicion.cambios.map((c) => c.campo).sort()).toEqual([
      'numeroCuotas',
      'valorSolicitado',
    ]);
  });
});

describe('cuatro ojos', () => {
  it('quien registra no aprueba: ADMIN no aprueba lo que registró, otro usuario sí', async () => {
    let credito = await crearCredito(admin.token);
    credito = await cambiarEstado(analista.token, credito, 'EN_ESTUDIO');
    const res = await pedirCambioEstado(admin.token, credito, 'APROBADO');
    expect(res.status).toBe(403);
    expect(fallo(res).message).toMatch(/registró/);

    credito = await cambiarEstado(analista.token, credito, 'APROBADO');
    expect(credito.estado).toBe('APROBADO');
    // ADMIN no aprobó este crédito: sí puede desembolsarlo.
    expect((await cambiarEstado(admin.token, credito, 'DESEMBOLSADO')).estado).toBe('DESEMBOLSADO');
  });

  it('quien aprueba no desembolsa: ADMIN no desembolsa lo que aprobó, TESORERIA sí', async () => {
    let credito = await crearCredito(asesor.token);
    credito = await cambiarEstado(admin.token, credito, 'EN_ESTUDIO');
    credito = await cambiarEstado(admin.token, credito, 'APROBADO');
    const res = await pedirCambioEstado(admin.token, credito, 'DESEMBOLSADO');
    expect(res.status).toBe(403);
    expect(fallo(res).message).toMatch(/aprobó/);
    expect((await cambiarEstado(tesoreria.token, credito, 'DESEMBOLSADO')).estado).toBe(
      'DESEMBOLSADO',
    );
  });

  it('ASESOR cancela un APROBADO con observación → 200', async () => {
    let credito = await crearCredito(asesor.token);
    credito = await cambiarEstado(analista.token, credito, 'EN_ESTUDIO');
    credito = await cambiarEstado(analista.token, credito, 'APROBADO');
    const cancelado = await cambiarEstado(asesor.token, credito, 'CANCELADO', {
      observacion: 'El asociado desistió',
    });
    expect(cancelado.estado).toBe('CANCELADO');
  });
});

describe('eliminación lógica', () => {
  const identificacion = identificacionAleatoria();
  let credito: Credito;

  beforeAll(async () => {
    credito = await crearCredito(asesor.token, {
      identificacionAsociado: identificacion,
      tipoCredito: 'CALAMIDAD_DOMESTICA',
    });
  });

  it('sin motivo → 400; con la versión vieja → 409', async () => {
    expect(camposConError(await eliminar(asesor.token, credito, {}))).toEqual(['motivo']);
    const vieja = await api()
      .delete(`/api/creditos/${credito.id}`)
      .set(...bearer(asesor.token))
      .send({ motivo: 'Registro duplicado', version: '0x0000000000000001' });
    expect(fallo(vieja).code).toBe('CREDITO_MODIFICADO');
  });

  it('DELETE → 200 { data: null }; para ASESOR deja de existir', async () => {
    const res = await eliminar(asesor.token, credito, { motivo: 'Registro duplicado por error' });
    expect(res.status).toBe(200);
    expect((res.body as { data: unknown }).data).toBeNull();
    expect(
      (
        await api()
          .get(`/api/creditos/${credito.id}`)
          .set(...bearer(asesor.token))
      ).status,
    ).toBe(404);
  });

  it('ADMIN lo ve, con quién y por qué lo eliminó, y su historial termina en ELIMINACION', async () => {
    const visto = exito(
      await api()
        .get(`/api/creditos/${credito.id}`)
        .set(...bearer(admin.token)),
      esquemaCredito,
    );
    expect(visto.eliminacion).toMatchObject({
      usuarioNombre: 'Asesor Demo',
      motivo: 'Registro duplicado por error',
    });
    expect((await historial(admin.token, credito))[0]?.tipo).toBe('ELIMINACION');
  });

  it('incluirEliminados: 403 para ASESOR; para ADMIN lo incluye solo con el filtro', async () => {
    expect(
      (
        await api()
          .get('/api/creditos?incluirEliminados=true')
          .set(...bearer(asesor.token))
      ).status,
    ).toBe(403);
    const con = await api()
      .get(`/api/creditos?identificacion=${identificacion}&incluirEliminados=true`)
      .set(...bearer(admin.token));
    const sin = await api()
      .get(`/api/creditos?identificacion=${identificacion}`)
      .set(...bearer(admin.token));
    expect(lista(con, esquemaCredito).meta.total).toBe(1);
    expect(lista(sin, esquemaCredito).meta.total).toBe(0);
  });

  it('eliminarlo otra vez → 404; y no bloquea un crédito nuevo del mismo tipo', async () => {
    expect((await eliminar(admin.token, credito, { motivo: 'x' })).status).toBe(404);
    await expect(
      crearCredito(asesor.token, {
        identificacionAsociado: identificacion,
        tipoCredito: 'CALAMIDAD_DOMESTICA',
      }),
    ).resolves.toMatchObject({ estado: 'SOLICITADO' });
  });
});
