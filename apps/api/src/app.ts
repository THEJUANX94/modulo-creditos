import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { config } from './config/config';
import { montarDocumentacion } from './docs/openapi';
import { authRoutes } from './modules/auth/authRoutes';
import { catalogosRoutes } from './modules/catalogos/catalogosRoutes';
import { creditosRoutes } from './modules/creditos/creditosRoutes';
import { healthRoutes } from './modules/health/healthRoutes';
import { usuariosRoutes } from './modules/usuarios/usuariosRoutes';
import { webhooksRoutes } from './modules/webhooks/webhooksRoutes';
import { errorHandler } from './shared/middlewares/errorHandler';
import { httpLogger } from './shared/middlewares/httpLogger';
import { notFound } from './shared/middlewares/notFound';
import { limiteGlobal } from './shared/middlewares/rateLimit';
import { requestId } from './shared/middlewares/requestId';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  // requestId antes del logger: así cada línea de log de la petición lo lleva.
  app.use(requestId);
  app.use(httpLogger);
  app.use(express.json({ limit: '100kb' }));

  // Health fuera del rate limit: el orquestador lo consulta seguido.
  app.use('/api/health', healthRoutes);

  app.use(limiteGlobal);
  montarDocumentacion(app);
  app.use('/api/auth', authRoutes);
  app.use('/api/usuarios', usuariosRoutes);
  app.use('/api/catalogos', catalogosRoutes);
  app.use('/api/creditos', creditosRoutes);
  app.use('/api/webhooks', webhooksRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
