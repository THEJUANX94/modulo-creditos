import { pino } from 'pino';
import { config } from '../config/config';
import { contextoPeticion } from './contextoPeticion';

// JSON a stdout (ADR 0010). En desarrollo, `pnpm dev` lo pasa por pino-pretty.
export const logger = pino({
  level: config.logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  // El requestId y el usuario de la petición en curso llegan a cada línea sin pasarlos a mano.
  mixin() {
    const contexto = contextoPeticion.getStore();
    if (!contexto) return {};
    return contexto.usuarioId
      ? { requestId: contexto.requestId, usuarioId: contexto.usuarioId }
      : { requestId: contexto.requestId };
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    censor: '[REDACTADO]',
  },
});

// Parámetros de consulta con datos personales (Ley 1581): la identificación se enmascara
// y la búsqueda libre (que puede ser un nombre) no se registra.
const parametrosSensibles: Record<string, (valor: string) => string> = {
  identificacion: (valor) => `${'*'.repeat(Math.max(valor.length - 4, 0))}${valor.slice(-4)}`,
  busqueda: () => '[REDACTADO]',
};

export function enmascararUrl(url: string): string {
  const inicioConsulta = url.indexOf('?');
  if (inicioConsulta === -1) return url;

  const parametros = new URLSearchParams(url.slice(inicioConsulta + 1));
  for (const [nombre, enmascarar] of Object.entries(parametrosSensibles)) {
    const valor = parametros.get(nombre);
    if (valor !== null) parametros.set(nombre, enmascarar(valor));
  }
  return `${url.slice(0, inicioConsulta)}?${parametros.toString()}`;
}
