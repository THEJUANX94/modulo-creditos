import { pinoHttp } from 'pino-http';
import { enmascararUrl, logger } from '../logger';

// Una línea por petición con metadatos: método, ruta, status y duración. Nunca los cuerpos (ADR 0010).
// El requestId lo agrega el logger desde el contexto de la petición.
export const httpLogger = pinoHttp({
  logger,
  customLogLevel: (_req, res, error) => {
    if (error || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${res.statusCode}`,
  serializers: {
    req: (req: { method: string; url: string }) => ({
      method: req.method,
      url: enmascararUrl(req.url),
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
});
