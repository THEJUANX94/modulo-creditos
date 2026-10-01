import { esquemaRespuestaSesion, esquemaUsuarioSesion } from '@creditos/shared';
import { SignJWT, decodeJwt } from 'jose';
import { setTimeout as esperar } from 'node:timers/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { obtenerHashFicticio } from '../../src/modules/auth/contrasenas';
import { prisma } from '../../src/shared/db/prisma';
import {
  api,
  bearer,
  claveUsuarios,
  cookieRefresh,
  correoDe,
  exito,
  fallo,
  valorCookie,
} from './apoyo/ayudas';

// Login, tokens, refresh rotativo, sesión única y logout (ADR 0016).

const login = (correo: string, contrasena: string) =>
  api().post('/api/auth/login').send({ correo, contrasena });
const refrescar = (cookie: string, conCsrf = true) => {
  const peticion = api().post('/api/auth/refresh').set('Cookie', cookie);
  return conCsrf ? peticion.set('X-CSRF', '1') : peticion;
};
const me = (token: string) =>
  api()
    .get('/api/auth/me')
    .set(...bearer(token));
const horasHasta = (cookie: string | undefined) =>
  (Date.parse(/Expires=([^;]+)/.exec(cookie ?? '')?.[1] ?? '') - Date.now()) / 3_600_000;

beforeAll(async () => {
  // Como en server.ts: el hash ficticio se calcula antes de medir tiempos de login.
  await obtenerHashFicticio();
});

describe('login fallido', () => {
  it('contraseña incorrecta y correo inexistente: el mismo 401, el mismo mensaje y un tiempo similar', async () => {
    const medir = async (correo: string) => {
      const inicio = performance.now();
      const res = await login(correo, 'contrasena-incorrecta');
      return { res, ms: performance.now() - inicio };
    };
    // Calentamiento: la primera petición paga la conexión a la BD y la carga de la app.
    await medir(correoDe('TESORERIA'));
    await medir('calentamiento@creditos.test');

    const incorrectas = [await medir(correoDe('ASESOR')), await medir(correoDe('ASESOR'))];
    const inexistentes = [await medir('nadie@creditos.test'), await medir('nadie@creditos.test')];
    const promedio = (medidas: { ms: number }[]) =>
      medidas.reduce((suma, medida) => suma + medida.ms, 0) / medidas.length;

    const incorrecta = incorrectas[0]?.res;
    const inexistente = inexistentes[0]?.res;
    if (!incorrecta || !inexistente) throw new Error('Sin medidas');
    expect(incorrecta.status).toBe(401);
    expect(fallo(incorrecta).code).toBe('CREDENCIALES_INVALIDAS');
    expect(inexistente.status).toBe(401);
    expect(fallo(inexistente).message).toBe(fallo(incorrecta).message);
    // Si el correo inexistente respondiera más rápido, delataría qué correos existen.
    expect(Math.abs(promedio(incorrectas) - promedio(inexistentes))).toBeLessThan(150);
  });

  it('cuerpo mal formado → 400 con un detalle por campo', async () => {
    const res = await api().post('/api/auth/login').send({ correo: 'no-es-correo' });
    expect(res.status).toBe(400);
    expect(fallo(res).details).toHaveLength(2);
  });
});

describe('login correcto', () => {
  it('acepta el correo en mayúsculas y devuelve token, expiración y usuario, sin caché', async () => {
    const res = await login(correoDe('ASESOR').toUpperCase(), claveUsuarios());
    expect(res.status).toBe(200);
    expect(res.get('Cache-Control')).toBe('no-store');
    const sesion = exito(res, esquemaRespuestaSesion);
    expect(sesion.usuario.rol).toBe('ASESOR');
    const minutos = (Date.parse(sesion.expiraEn) - Date.now()) / 60_000;
    expect(minutos).toBeGreaterThan(14.5);
    expect(minutos).toBeLessThanOrEqual(15);
  });

  it('el refresh token va en una cookie HttpOnly, Secure, SameSite=Strict, solo para /api/auth, por 8 h', async () => {
    const cookie = cookieRefresh(await login(correoDe('ASESOR'), claveUsuarios()));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(horasHasta(cookie)).toBeGreaterThan(7.9);
    expect(horasHasta(cookie)).toBeLessThanOrEqual(8);
  });
});

describe('access token y permisos', () => {
  let token = '';
  beforeAll(async () => {
    token = exito(
      await login(correoDe('ASESOR'), claveUsuarios()),
      esquemaRespuestaSesion,
    ).accessToken;
  });

  it('GET /auth/me devuelve el usuario de la sesión', async () => {
    const usuario = exito(await me(token), esquemaUsuarioSesion);
    expect(usuario.correo).toBe(correoDe('ASESOR'));
  });

  it('sin token → 401 NO_AUTENTICADO; ASESOR en /usuarios → 403 SIN_PERMISO', async () => {
    expect(fallo(await api().get('/api/usuarios')).code).toBe('NO_AUTENTICADO');
    const res = await api()
      .get('/api/usuarios')
      .set(...bearer(token));
    expect(res.status).toBe(403);
    expect(fallo(res).code).toBe('SIN_PERMISO');
  });

  it('un token con el rol cambiado a mano → 401 (la firma ya no coincide)', async () => {
    const [cabecera, carga, firma] = token.split('.');
    const manipulada = Buffer.from(JSON.stringify({ ...decodeJwt(token), rol: 'ADMIN' })).toString(
      'base64url',
    );
    expect(carga).toBeDefined();
    expect((await me(`${cabecera}.${manipulada}.${firma}`)).status).toBe(401);
  });

  it('un token vencido → 401, aunque la firma sea válida', async () => {
    const { sub, sid, rol } = decodeJwt(token);
    const haceUnaHora = Math.floor(Date.now() / 1000) - 3600;
    const vencido = await new SignJWT({ sid, rol })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(String(sub))
      .setIssuer('modulo-creditos')
      .setAudience('modulo-creditos-api')
      .setIssuedAt(haceUnaHora - 900)
      .setExpirationTime(haceUnaHora)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    expect((await me(vencido)).status).toBe(401);
  });

  it('un token sin firma (alg: none) → 401', async () => {
    const [, carga] = token.split('.');
    const sinFirma = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${carga}.`;
    expect((await me(sinFirma)).status).toBe(401);
  });
});

describe('refresh: CSRF, rotación, gracia y reuso', () => {
  it('sin el header X-CSRF → 403 CSRF_INVALIDO', async () => {
    const cookie = valorCookie(cookieRefresh(await login(correoDe('ANALISTA'), claveUsuarios())));
    const res = await refrescar(cookie, false);
    expect(res.status).toBe(403);
    expect(fallo(res).code).toBe('CSRF_INVALIDO');
  });

  it('rota el token sin extender la sesión; el viejo sirve 10 s y después revoca toda la sesión', async () => {
    const inicial = await login(correoDe('ANALISTA'), claveUsuarios());
    const cookieVieja = valorCookie(cookieRefresh(inicial));

    const rotado = await refrescar(cookieVieja);
    expect(rotado.status).toBe(200);
    const cookieNueva = cookieRefresh(rotado);
    expect(valorCookie(cookieNueva)).not.toBe(cookieVieja);
    expect(Math.abs(horasHasta(cookieNueva) - horasHasta(cookieRefresh(inicial)))).toBeLessThan(
      0.01,
    );
    const tokenNuevo = exito(rotado, esquemaRespuestaSesion).accessToken;

    // Dos pestañas que refrescan casi a la vez: el token viejo todavía sirve.
    expect((await refrescar(cookieVieja)).status).toBe(200);

    await esperar(11_000);
    const reuso = await refrescar(cookieVieja);
    expect(reuso.status).toBe(401);
    expect(fallo(reuso).code).toBe('SESION_INVALIDA');
    // Un reuso tardío es señal de robo: se corta la sesión entera.
    expect(fallo(await me(tokenNuevo)).code).toBe('SESION_INVALIDA');
    expect((await refrescar(valorCookie(cookieNueva))).status).toBe(401);
  });
});

describe('sesión única', () => {
  it('un segundo login corta la primera sesión al instante', async () => {
    const primera = exito(await login(correoDe('ADMIN'), claveUsuarios()), esquemaRespuestaSesion);
    const segunda = exito(await login(correoDe('ADMIN'), claveUsuarios()), esquemaRespuestaSesion);
    expect(fallo(await me(primera.accessToken)).code).toBe('SESION_INVALIDA');
    expect((await me(segunda.accessToken)).status).toBe(200);
  });

  it('dos logins simultáneos: ambos 200, y solo una de las dos sesiones queda viva', async () => {
    const [a, b] = await Promise.all([
      login(correoDe('TESORERIA'), claveUsuarios()),
      login(correoDe('TESORERIA'), claveUsuarios()),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const estados = await Promise.all(
      [a, b].map(async (res) => (await me(exito(res, esquemaRespuestaSesion).accessToken)).status),
    );
    expect(estados.sort()).toEqual([200, 401]);
  });

  it('en la BD nunca hay más de una sesión activa por usuario', async () => {
    const activas = await prisma.sesiones.findMany({
      where: { fechaRevocacion: null },
      select: { usuarioId: true },
    });
    const usuarios = activas.map((sesion) => sesion.usuarioId);
    expect(new Set(usuarios).size).toBe(usuarios.length);
  });
});

describe('logout', () => {
  it('revoca la sesión, borra la cookie y es idempotente', async () => {
    const res = await login(correoDe('ADMIN'), claveUsuarios());
    const { accessToken } = exito(res, esquemaRespuestaSesion);
    const cookie = valorCookie(cookieRefresh(res));

    const salir = await api().post('/api/auth/logout').set('Cookie', cookie).set('X-CSRF', '1');
    expect(salir.status).toBe(200);
    expect((salir.body as { data: unknown }).data).toBeNull();
    expect(cookieRefresh(salir)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await me(accessToken)).status).toBe(401);

    const otraVez = await api().post('/api/auth/logout').set('Cookie', cookie).set('X-CSRF', '1');
    expect(otraVez.status).toBe(200);
  });
});

describe('eventos de seguridad', () => {
  it('quedan registrados login, fallos, refresh, reuso, sesión reemplazada y logout', async () => {
    const tipos = await prisma.eventosSeguridad.findMany({
      distinct: ['tipoEvento'],
      select: { tipoEvento: true },
    });
    expect(tipos.map((evento) => evento.tipoEvento)).toEqual(
      expect.arrayContaining([
        'LOGIN_EXITOSO',
        'LOGIN_FALLIDO',
        'REFRESH',
        'REFRESH_REUTILIZADO',
        'SESION_REEMPLAZADA',
        'LOGOUT',
        'ACCESO_DENEGADO',
      ]),
    );
  });
});
