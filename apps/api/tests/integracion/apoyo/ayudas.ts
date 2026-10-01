import {
  esquemaCredito,
  esquemaMetaPaginacion,
  esquemaRespuestaError,
  esquemaRespuestaSesion,
  type Credito,
  type MetaPaginacion,
  type RespuestaError,
  type Rol,
  type UsuarioSesion,
} from '@creditos/shared';
import request, { type Response } from 'supertest';
import { z } from 'zod';
import { createApp } from '../../../src/app';

// Piezas comunes de las pruebas de integración. Cada archivo carga su propia app (y con ella su
// propio rate limit en memoria), contra la BD de pruebas.

export const app = createApp();
export const api = () => request(app);

// Las respuestas se leen validándolas con el esquema que publica Swagger: cada prueba verifica
// también el contrato, no solo los datos.
export function exito<T extends z.ZodType>(res: Response, esquema: T): z.output<T> {
  const sobre = z.object({ success: z.literal(true), data: z.unknown() }).parse(res.body);
  return esquema.parse(sobre.data);
}

export function lista<T extends z.ZodType>(
  res: Response,
  esquema: T,
): { data: z.output<T>[]; meta: MetaPaginacion } {
  const sobre = z
    .object({ success: z.literal(true), data: z.array(z.unknown()), meta: esquemaMetaPaginacion })
    .parse(res.body);
  return { data: sobre.data.map((item) => esquema.parse(item)), meta: sobre.meta };
}

export function fallo(res: Response): RespuestaError['error'] {
  return esquemaRespuestaError.parse(res.body).error;
}

export function camposConError(res: Response): string[] {
  return (fallo(res).details ?? []).map((detalle) => detalle.campo).sort();
}

// Para `.set(...bearer(token))`.
export const bearer = (token: string) => ['Authorization', `Bearer ${token}`] as const;

export const correoDe = (rol: Rol) => `${rol.toLowerCase()}@creditos.test`;

// La crea el setup global con el script de usuarios demo (vitest.integracion.config.ts).
export function claveUsuarios(): string {
  const clave = process.env.USUARIOS_DEMO_CLAVE;
  if (!clave) throw new Error('Falta USUARIOS_DEMO_CLAVE en el entorno de pruebas');
  return clave;
}

export function cookieRefresh(res: Response): string | undefined {
  return res.get('Set-Cookie')?.find((cookie) => cookie.startsWith('refreshToken='));
}

// "refreshToken=…; Path=…" → "refreshToken=…", lo que el navegador reenviaría.
export const valorCookie = (cookie: string | undefined) => cookie?.split(';')[0] ?? '';

export interface Sesion {
  token: string;
  usuario: UsuarioSesion;
  cookie: string;
}

export async function iniciarSesion(rol: Rol): Promise<Sesion> {
  const res = await api()
    .post('/api/auth/login')
    .send({ correo: correoDe(rol), contrasena: claveUsuarios() });
  if (res.status !== 200) throw new Error(`Login de ${rol}: ${res.status} ${res.text}`);
  const sesion = exito(res, esquemaRespuestaSesion);
  return {
    token: sesion.accessToken,
    usuario: sesion.usuario,
    cookie: valorCookie(cookieRefresh(res)),
  };
}

// Identificaciones aleatorias de 10 dígitos: cada prueba usa sus propios asociados, porque las
// tablas inmutables no se limpian entre pruebas.
export const identificacionAleatoria = () => String(Math.floor(1e9 + Math.random() * 8.9e9));

// El payload del enunciado.
export const ejemploCredito = {
  nombreAsociado: 'Juan Perez',
  tipoCredito: 'LIBRE_INVERSION',
  valorSolicitado: 15000000,
  tasaInteres: 1.5,
  numeroCuotas: 36,
  formaPago: 'NOMINA',
};

export function pedirCreacion(token: string, cambios: Record<string, unknown> = {}) {
  return api()
    .post('/api/creditos')
    .set(...bearer(token))
    .send({ ...ejemploCredito, identificacionAsociado: identificacionAleatoria(), ...cambios });
}

export async function crearCredito(
  token: string,
  cambios: Record<string, unknown> = {},
): Promise<Credito> {
  const res = await pedirCreacion(token, cambios);
  if (res.status !== 201) throw new Error(`Crear crédito: ${res.status} ${res.text}`);
  return exito(res, esquemaCredito);
}

export function pedirCambioEstado(
  token: string,
  credito: Credito,
  estado: string,
  extra: Record<string, unknown> = {},
) {
  return api()
    .patch(`/api/creditos/${credito.id}/estado`)
    .set(...bearer(token))
    .send({ estado, version: credito.version, ...extra });
}

export async function cambiarEstado(
  token: string,
  credito: Credito,
  estado: string,
  extra: Record<string, unknown> = {},
): Promise<Credito> {
  const res = await pedirCambioEstado(token, credito, estado, extra);
  if (res.status !== 200) throw new Error(`Cambiar a ${estado}: ${res.status} ${res.text}`);
  return exito(res, esquemaCredito);
}
