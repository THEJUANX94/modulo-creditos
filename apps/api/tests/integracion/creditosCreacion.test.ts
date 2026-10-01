import { esquemaCatalogos, esquemaCredito, type Credito } from '@creditos/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  bearer,
  camposConError,
  ejemploCredito,
  exito,
  fallo,
  identificacionAleatoria,
  iniciarSesion,
  pedirCreacion,
  type Sesion,
} from './apoyo/ayudas';

// Mínimos del enunciado: creación de crédito, validaciones y consulta inexistente. Reglas de
// asociado y duplicados del ADR 0014.

let asesor: Sesion;
let analista: Sesion;
let tesoreria: Sesion;

beforeAll(async () => {
  [asesor, analista, tesoreria] = await Promise.all([
    iniciarSesion('ASESOR'),
    iniciarSesion('ANALISTA'),
    iniciarSesion('TESORERIA'),
  ]);
});

describe('catálogos', () => {
  it('trae los tipos de crédito, las formas de pago, los tipos de identificación y los estados', async () => {
    const catalogos = exito(
      await api()
        .get('/api/catalogos')
        .set(...bearer(tesoreria.token)),
      esquemaCatalogos,
    );
    expect(catalogos.tiposCredito).toHaveLength(8);
    expect(catalogos.formasPago).toHaveLength(4);
    expect(catalogos.tiposIdentificacion).toHaveLength(5);
    expect(catalogos.estados).toHaveLength(6);
  });
});

describe('crear', () => {
  const idJuan = identificacionAleatoria();
  let credito: Credito;

  it('el payload exacto del enunciado → 201 con Location, número, montos exactos y SOLICITADO', async () => {
    const res = await api()
      .post('/api/creditos')
      .set(...bearer(asesor.token))
      .send({ ...ejemploCredito, identificacionAsociado: idJuan });
    expect(res.status).toBe(201);
    credito = exito(res, esquemaCredito);
    expect(res.get('Location')).toBe(`/api/creditos/${credito.id}`);
    expect(credito.numeroCredito).toMatch(/^CR-\d{4}-\d{6,}$/);
    expect(credito).toMatchObject({
      tipoIdentificacionAsociado: 'CC',
      identificacionAsociado: idJuan,
      valorSolicitado: '15000000.00',
      tasaInteres: '1.5000',
      estado: 'SOLICITADO',
    });
    expect(credito.version).toMatch(/^0x[0-9A-F]{16}$/i);
  });

  it('montos como string, y el mismo asociado con otras mayúsculas y espacios → 201', async () => {
    const res = await pedirCreacion(asesor.token, {
      identificacionAsociado: idJuan,
      tipoCredito: 'EDUCATIVO',
      nombreAsociado: '  juan   PEREZ ',
      valorSolicitado: '2500000.5',
      tasaInteres: '1.25',
    });
    expect(res.status).toBe(201);
    expect(exito(res, esquemaCredito)).toMatchObject({
      valorSolicitado: '2500000.50',
      tasaInteres: '1.2500',
      nombreAsociado: 'Juan Perez',
    });
  });

  it('misma identificación con otro nombre → 422 ASOCIADO_NOMBRE_NO_COINCIDE', async () => {
    const res = await pedirCreacion(asesor.token, {
      identificacionAsociado: idJuan,
      tipoCredito: 'VIVIENDA',
      nombreAsociado: 'Pedro Gómez',
    });
    expect(res.status).toBe(422);
    expect(fallo(res).code).toBe('ASOCIADO_NOMBRE_NO_COINCIDE');
  });

  it('un segundo crédito del mismo tipo en curso → 409 CREDITO_DUPLICADO; otro tipo → 201', async () => {
    const duplicado = await pedirCreacion(asesor.token, { identificacionAsociado: idJuan });
    expect(duplicado.status).toBe(409);
    expect(fallo(duplicado).code).toBe('CREDITO_DUPLICADO');
    expect(
      (
        await pedirCreacion(asesor.token, {
          identificacionAsociado: idJuan,
          tipoCredito: 'VEHICULO',
        })
      ).status,
    ).toBe(201);
  });

  it('dos creaciones simultáneas del mismo crédito → una 201 y otra 409', async () => {
    const identificacion = identificacionAleatoria();
    const respuestas = await Promise.all(
      [1, 2].map(() => pedirCreacion(asesor.token, { identificacionAsociado: identificacion })),
    );
    expect(respuestas.map((res) => res.status).sort()).toEqual([201, 409]);
  });

  it('pasaporte con letras → 201', async () => {
    const res = await pedirCreacion(asesor.token, {
      tipoIdentificacionAsociado: 'PA',
      identificacionAsociado: `AB${identificacionAleatoria().slice(0, 6)}`,
    });
    expect(res.status).toBe(201);
  });

  it('ANALISTA no puede crear → 403', async () => {
    expect((await pedirCreacion(analista.token)).status).toBe(403);
  });
});

describe('validaciones', () => {
  it.each([
    [{ valorSolicitado: 0 }, 'valorSolicitado'],
    [{ valorSolicitado: 1.234 }, 'valorSolicitado'],
    [{ valorSolicitado: -5 }, 'valorSolicitado'],
    [{ tasaInteres: 120 }, 'tasaInteres'],
    [{ numeroCuotas: 0 }, 'numeroCuotas'],
    [{ numeroCuotas: 361 }, 'numeroCuotas'],
    [{ identificacionAsociado: '10A20' }, 'identificacionAsociado'],
    [{ tipoCredito: 'HIPOTECA' }, 'tipoCredito'],
  ])('%j → 400 en %s', async (cambios, campo) => {
    const res = await pedirCreacion(asesor.token, cambios);
    expect(res.status).toBe(400);
    expect(fallo(res).code).toBe('VALIDACION_FALLIDA');
    expect(camposConError(res)).toEqual([campo]);
  });

  it('cuerpo vacío → 400 con un detalle por campo', async () => {
    const res = await api()
      .post('/api/creditos')
      .set(...bearer(asesor.token))
      .send({});
    expect(res.status).toBe(400);
    expect(fallo(res).details?.length).toBeGreaterThanOrEqual(6);
  });

  it('JSON mal formado → 400', async () => {
    const res = await api()
      .post('/api/creditos')
      .set(...bearer(asesor.token))
      .set('Content-Type', 'application/json')
      .send('{"valorSolicitado": ');
    expect(res.status).toBe(400);
  });
});

describe('consultar', () => {
  it('un crédito existente → 200; uno inexistente → 404 CREDITO_NOT_FOUND; un id inválido → 400', async () => {
    const res = await pedirCreacion(asesor.token);
    const credito = exito(res, esquemaCredito);
    const existente = await api()
      .get(`/api/creditos/${credito.id}`)
      .set(...bearer(tesoreria.token));
    expect(exito(existente, esquemaCredito).id).toBe(credito.id);

    const inexistente = await api()
      .get('/api/creditos/00000000-0000-4000-8000-000000000000')
      .set(...bearer(tesoreria.token));
    expect(inexistente.status).toBe(404);
    expect(fallo(inexistente)).toMatchObject({
      code: 'CREDITO_NOT_FOUND',
      message: 'El crédito no existe',
    });

    expect(
      (
        await api()
          .get('/api/creditos/abc')
          .set(...bearer(tesoreria.token))
      ).status,
    ).toBe(400);
  });
});
