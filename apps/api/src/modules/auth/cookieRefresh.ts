import type { CookieOptions, Request, Response } from 'express';

// Cookie del refresh token (ADR 0016): JavaScript no la lee, solo viaja por HTTPS (los
// navegadores aceptan Secure en http://localhost), nunca en peticiones de otro sitio y solo hacia /api/auth.
const nombreCookie = 'refreshToken';

const opciones: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api/auth',
};

export function escribirCookieRefresh(res: Response, token: string, expiraEn: Date): void {
  res.cookie(nombreCookie, token, { ...opciones, expires: expiraEn });
}

export function borrarCookieRefresh(res: Response): void {
  res.clearCookie(nombreCookie, opciones);
}

export function leerCookieRefresh(req: Request): string | undefined {
  const cabecera = req.get('Cookie');
  if (!cabecera) return undefined;

  for (const parte of cabecera.split(';')) {
    const [nombre, ...valor] = parte.trim().split('=');
    if (nombre === nombreCookie) return valor.join('=') || undefined;
  }
  return undefined;
}
