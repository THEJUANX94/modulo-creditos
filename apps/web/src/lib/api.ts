import {
  esquemaMetaPaginacion,
  esquemaRespuestaError,
  esquemaRespuestaSesion,
  type CodigoError,
  type DetalleError,
  type MetaPaginacion,
  type RespuestaSesion,
} from '@creditos/shared';
import { z } from 'zod';

// Cliente HTTP de la web (ADR 0021). Habla con la API por el mismo origen (/api). El access token
// vive solo en memoria (ADR 0016); el refresh token, en la cookie httpOnly que la web nunca lee.
// Cada respuesta se valida con el esquema de @creditos/shared: si la API se aparta del contrato,
// falla aquí y no en un componente.

export type MotivoCierre = 'SESION_INVALIDA' | 'SESION_VENCIDA';

export class ErrorApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: CodigoError | 'ERROR_RED',
    mensaje: string,
    readonly detalles: DetalleError[] = [],
    readonly requestId?: string,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

let tokenAcceso: string | null = null;
let alCerrarSesion: ((motivo: MotivoCierre) => void) | null = null;
let refrescoEnCurso: Promise<RespuestaSesion | null> | null = null;

export function fijarToken(token: string | null): void {
  tokenAcceso = token;
}

// La sesión la cierra el servidor (otro login, desactivación, reuso del refresh) o vence:
// el proveedor de sesión vuelve al login con el motivo.
export function registrarCierreSesion(callback: (motivo: MotivoCierre) => void): void {
  alCerrarSesion = callback;
}

// Sin respuesta (red caída o servidor apagado): se trata como un error de red.
const sinCuerpo = { status: 0, ok: false, json: () => Promise.resolve(null) } as const;

async function enviar(ruta: string, metodo: string, cuerpo: unknown, conCsrf: boolean) {
  const encabezados = new Headers();
  if (cuerpo !== undefined) encabezados.set('Content-Type', 'application/json');
  if (tokenAcceso) encabezados.set('Authorization', `Bearer ${tokenAcceso}`);
  // Las rutas que usan la cookie del refresh exigen este header (anti-CSRF, ADR 0016).
  if (conCsrf) encabezados.set('X-CSRF', '1');
  try {
    return await fetch(`/api${ruta}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: encabezados,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    return sinCuerpo;
  }
}

async function leerError(res: Response | typeof sinCuerpo): Promise<ErrorApi> {
  if (res.status === 0) {
    return new ErrorApi(
      0,
      'ERROR_RED',
      'No hay conexión con el servidor. Revise su red e intente de nuevo.',
    );
  }
  const cuerpo = esquemaRespuestaError.safeParse(await res.json().catch(() => null));
  if (!cuerpo.success) {
    return new ErrorApi(
      res.status,
      'ERROR_INTERNO',
      'El servidor respondió algo inesperado. Intente de nuevo.',
    );
  }
  const { error, requestId } = cuerpo.data;
  return new ErrorApi(res.status, error.code, error.message, error.details ?? [], requestId);
}

// Un solo refresh a la vez: si varias peticiones reciben 401 juntas, todas esperan el mismo.
export function refrescarSesion(): Promise<RespuestaSesion | null> {
  refrescoEnCurso ??= (async () => {
    const res = await enviar('/auth/refresh', 'POST', undefined, true);
    if (!res.ok) return null;
    const sesion = esquemaRespuestaSesion.parse(((await res.json()) as { data: unknown }).data);
    tokenAcceso = sesion.accessToken;
    return sesion;
  })().finally(() => {
    refrescoEnCurso = null;
  });
  return refrescoEnCurso;
}

interface Opciones {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  cuerpo?: unknown;
  conCsrf?: boolean;
  // Login, logout y cambio de contraseña no reintentan con refresh.
  sinRefresh?: boolean;
}

async function pedirSobre(ruta: string, opciones: Opciones): Promise<unknown> {
  const metodo = opciones.metodo ?? 'GET';
  let res = await enviar(ruta, metodo, opciones.cuerpo, opciones.conCsrf ?? false);

  if (res.status === 401 && !opciones.sinRefresh) {
    const error = await leerError(res);
    if (error.codigo === 'SESION_INVALIDA') {
      tokenAcceso = null;
      alCerrarSesion?.('SESION_INVALIDA');
      throw error;
    }
    // El access token venció (dura 15 min): se refresca una vez y se repite la petición.
    const sesion = await refrescarSesion();
    if (!sesion) {
      tokenAcceso = null;
      alCerrarSesion?.('SESION_VENCIDA');
      throw error;
    }
    res = await enviar(ruta, metodo, opciones.cuerpo, opciones.conCsrf ?? false);
  }

  if (!res.ok) throw await leerError(res);
  return res.json();
}

export async function pedir<T extends z.ZodType>(
  ruta: string,
  esquema: T,
  opciones: Opciones = {},
): Promise<z.output<T>> {
  const sobre = z.object({ data: z.unknown() }).parse(await pedirSobre(ruta, opciones));
  return esquema.parse(sobre.data);
}

export async function pedirLista<T extends z.ZodType>(
  ruta: string,
  esquema: T,
): Promise<{ datos: z.output<T>[]; meta: MetaPaginacion }> {
  const sobre = z
    .object({ data: z.array(z.unknown()), meta: esquemaMetaPaginacion })
    .parse(await pedirSobre(ruta, {}));
  return { datos: sobre.data.map((item) => esquema.parse(item)), meta: sobre.meta };
}

// "?estado=SOLICITADO&pagina=2" sin parámetros vacíos.
export function consulta(
  parametros: Record<string, string | number | boolean | undefined>,
): string {
  const busqueda = new URLSearchParams();
  for (const [nombre, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== '') busqueda.set(nombre, String(valor));
  }
  const texto = busqueda.toString();
  return texto ? `?${texto}` : '';
}
