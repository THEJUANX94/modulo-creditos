import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit, type RateLimitExceededEventHandler } from 'express-rate-limit';
import { AppError } from '../errores/appError';

// Límites de peticiones (ADR 0016). El almacén es la memoria del proceso: no se comparte entre
// réplicas. En producción con varias réplicas iría a Redis (propuesta de escalabilidad).

const minuto = 60 * 1000;

// express-rate-limit deja en req.rateLimit cuándo se reinicia el contador.
type RequestConLimite = Request & { rateLimit?: { resetTime?: Date } };

const responderExceso: RateLimitExceededEventHandler = (req, res, next, opciones) => {
  const reinicio = (req as RequestConLimite).rateLimit?.resetTime;
  if (reinicio) {
    res.setHeader('Retry-After', Math.max(Math.ceil((reinicio.getTime() - Date.now()) / 1000), 1));
  }
  next(new AppError('DEMASIADAS_SOLICITUDES', String(opciones.message)));
};

function ipDe(req: Request): string {
  return ipKeyGenerator(req.ip ?? 'desconocida');
}

// Toda la API: 300 peticiones por minuto por IP.
export const limiteGlobal: RequestHandler = rateLimit({
  windowMs: minuto,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: ipDe,
  message: 'Demasiadas solicitudes. Intente de nuevo en un momento.',
  handler: responderExceso,
});

// Login por IP: 20 intentos cada 15 minutos, exitosos o no.
export const limiteLoginPorIp: RequestHandler = rateLimit({
  windowMs: 15 * minuto,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: ipDe,
  message: 'Demasiados intentos de inicio de sesión desde esta red. Intente más tarde.',
  handler: responderExceso,
});

// Login por IP + correo: 5 intentos fallidos cada 15 minutos. Frena la fuerza bruta sobre una
// cuenta sin bloquearla para los demás (no hay bloqueo de cuentas, ADR 0016).
export const limiteLoginPorCuenta: RequestHandler = rateLimit({
  windowMs: 15 * minuto,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const cuerpo = req.body as { correo?: unknown } | undefined;
    const correo = typeof cuerpo?.correo === 'string' ? cuerpo.correo.trim().toLowerCase() : '';
    return `${ipDe(req)}|${correo}`;
  },
  message: 'Demasiados intentos fallidos para esta cuenta. Intente de nuevo en 15 minutos.',
  handler: responderExceso,
});
