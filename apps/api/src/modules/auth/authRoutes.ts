import { Router } from 'express';
import { exigirCsrf } from '../../shared/middlewares/exigirCsrf';
import { limiteLoginPorCuenta, limiteLoginPorIp } from '../../shared/middlewares/rateLimit';
import * as authController from './authController';
import { autenticar } from './autenticar';

export const authRoutes = Router();

authRoutes.post('/login', limiteLoginPorIp, limiteLoginPorCuenta, authController.login);
// Usan la cookie de refresh: exigen el header anti-CSRF.
authRoutes.post('/refresh', exigirCsrf, authController.refresh);
authRoutes.post('/logout', exigirCsrf, authController.logout);
// Disponibles aunque la contraseña temporal no se haya cambiado.
authRoutes.post(
  '/contrasena',
  autenticar({ permitirCambioPendiente: true }),
  authController.cambiarContrasena,
);
authRoutes.get('/me', autenticar({ permitirCambioPendiente: true }), authController.me);
