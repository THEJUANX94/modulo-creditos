import { esquemaRespuestaSesion, esquemaUsuario } from '@creditos/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  bearer,
  camposConError,
  cookieRefresh,
  exito,
  fallo,
  iniciarSesion,
  lista,
  type Sesion,
} from './apoyo/ayudas';

// Gestión de usuarios (solo ADMIN) y contraseña temporal (ADR 0016).

const temporal = 'TemporalSegura2026';
const definitiva = 'DefinitivaSegura2026';
const correoNuevo = `prueba.${Date.now()}@creditos.test`;
const login = (correo: string, contrasena: string) =>
  api().post('/api/auth/login').send({ correo, contrasena });
const me = (token: string) =>
  api()
    .get('/api/auth/me')
    .set(...bearer(token));

let admin: Sesion;
let idNuevo = '';

beforeAll(async () => {
  admin = await iniciarSesion('ADMIN');
});

describe('crear y listar', () => {
  it('ADMIN crea un usuario con contraseña temporal → 201 con debeCambiarContrasena', async () => {
    const res = await api()
      .post('/api/usuarios')
      .set(...bearer(admin.token))
      .send({
        correo: correoNuevo,
        nombre: 'Usuario Prueba',
        rol: 'ADMIN',
        contrasenaTemporal: temporal,
      });
    expect(res.status).toBe(201);
    const usuario = exito(res, esquemaUsuario);
    expect(usuario.debeCambiarContrasena).toBe(true);
    idNuevo = usuario.id;
  });

  it('correo repetido → 409 CORREO_DUPLICADO', async () => {
    const res = await api()
      .post('/api/usuarios')
      .set(...bearer(admin.token))
      .send({ correo: correoNuevo, nombre: 'Otro', rol: 'ASESOR', contrasenaTemporal: temporal });
    expect(res.status).toBe(409);
    expect(fallo(res).code).toBe('CORREO_DUPLICADO');
  });

  it('contraseña corta y rol inválido → 400 con el detalle de ambos', async () => {
    const res = await api()
      .post('/api/usuarios')
      .set(...bearer(admin.token))
      .send({ correo: 'x@creditos.test', nombre: 'X', rol: 'JEFE', contrasenaTemporal: 'corta' });
    expect(res.status).toBe(400);
    expect(camposConError(res)).toEqual(['contrasenaTemporal', 'rol']);
  });

  it('listado paginado con meta; más de 100 por página → 400', async () => {
    const pagina = lista(
      await api()
        .get('/api/usuarios?pagina=1&tamanoPagina=2')
        .set(...bearer(admin.token)),
      esquemaUsuario,
    );
    expect(pagina.data).toHaveLength(2);
    expect(pagina.meta.total).toBeGreaterThanOrEqual(5);
    expect(
      (
        await api()
          .get('/api/usuarios?tamanoPagina=101')
          .set(...bearer(admin.token))
      ).status,
    ).toBe(400);
  });
});

describe('contraseña temporal', () => {
  let tokenTemporal = '';
  let tokenDefinitivo = '';

  it('con la temporal se entra, pero las demás rutas responden 403 CAMBIO_CONTRASENA_REQUERIDO', async () => {
    const sesion = exito(await login(correoNuevo, temporal), esquemaRespuestaSesion);
    expect(sesion.usuario.debeCambiarContrasena).toBe(true);
    tokenTemporal = sesion.accessToken;
    const res = await api()
      .get('/api/usuarios')
      .set(...bearer(tokenTemporal));
    expect(res.status).toBe(403);
    expect(fallo(res).code).toBe('CAMBIO_CONTRASENA_REQUERIDO');
  });

  it('cambiarla con la actual equivocada → 400 en contrasenaActual', async () => {
    const res = await api()
      .post('/api/auth/contrasena')
      .set(...bearer(tokenTemporal))
      .send({ contrasenaActual: 'equivocada', contrasenaNueva: definitiva });
    expect(res.status).toBe(400);
    expect(camposConError(res)).toEqual(['contrasenaActual']);
  });

  it('el cambio correcto abre una sesión nueva y corta la anterior', async () => {
    const res = await api()
      .post('/api/auth/contrasena')
      .set(...bearer(tokenTemporal))
      .send({ contrasenaActual: temporal, contrasenaNueva: definitiva });
    expect(res.status).toBe(200);
    const sesion = exito(res, esquemaRespuestaSesion);
    expect(sesion.usuario.debeCambiarContrasena).toBe(false);
    expect(cookieRefresh(res)).toBeDefined();
    tokenDefinitivo = sesion.accessToken;
    expect((await me(tokenTemporal)).status).toBe(401);
    expect(
      (
        await api()
          .get('/api/usuarios')
          .set(...bearer(tokenDefinitivo))
      ).status,
    ).toBe(200);
  });

  it('cambiar el rol corta la sesión del usuario', async () => {
    const res = await api()
      .patch(`/api/usuarios/${idNuevo}/rol`)
      .set(...bearer(admin.token))
      .send({ rol: 'ANALISTA' });
    expect(exito(res, esquemaUsuario).rol).toBe('ANALISTA');
    expect((await me(tokenDefinitivo)).status).toBe(401);
  });
});

describe('activar y desactivar', () => {
  it('desactivar corta la sesión al instante, y el usuario ya no puede entrar', async () => {
    const sesion = exito(await login(correoNuevo, definitiva), esquemaRespuestaSesion);
    const res = await api()
      .patch(`/api/usuarios/${idNuevo}/estado`)
      .set(...bearer(admin.token))
      .send({ activo: false });
    expect(exito(res, esquemaUsuario).activo).toBe(false);
    expect((await me(sesion.accessToken)).status).toBe(401);

    const inactivo = await login(correoNuevo, definitiva);
    expect(inactivo.status).toBe(401);
    expect(fallo(inactivo).code).toBe('CREDENCIALES_INVALIDAS');
  });

  it('un ADMIN no puede desactivarse a sí mismo → 403', async () => {
    const res = await api()
      .patch(`/api/usuarios/${admin.usuario.id}/estado`)
      .set(...bearer(admin.token))
      .send({ activo: false });
    expect(res.status).toBe(403);
  });

  it('id que no es UUID → 400; usuario inexistente → 404 USUARIO_NOT_FOUND', async () => {
    expect(
      (
        await api()
          .patch('/api/usuarios/no-es-uuid/rol')
          .set(...bearer(admin.token))
          .send({ rol: 'ADMIN' })
      ).status,
    ).toBe(400);
    const res = await api()
      .patch('/api/usuarios/00000000-0000-4000-8000-000000000000/rol')
      .set(...bearer(admin.token))
      .send({ rol: 'ADMIN' });
    expect(res.status).toBe(404);
    expect(fallo(res).code).toBe('USUARIO_NOT_FOUND');
  });
});
