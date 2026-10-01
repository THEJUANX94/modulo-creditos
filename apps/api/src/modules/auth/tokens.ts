import { createHash, randomBytes } from 'node:crypto';
import { roles, type Rol } from '@creditos/shared';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../../config/config';
import { duracionAccessTokenMs } from './politicaSesion';

const clave = new TextEncoder().encode(config.jwtSecret);
const emisor = 'modulo-creditos';
const audiencia = 'modulo-creditos-api';

export interface ClaimsAcceso {
  usuarioId: string;
  sesionId: bigint;
  rol: Rol;
}

export async function firmarAccessToken(
  claims: ClaimsAcceso,
): Promise<{ token: string; expiraEn: Date }> {
  const expiraEn = new Date(Date.now() + duracionAccessTokenMs);
  const token = await new SignJWT({ rol: claims.rol, sid: claims.sesionId.toString() })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.usuarioId)
    .setIssuer(emisor)
    .setAudience(audiencia)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiraEn.getTime() / 1000))
    .sign(clave);
  return { token, expiraEn };
}

// Lanza los errores de jose: JWTExpired si venció; cualquier otro si es inválido o fue manipulado.
// El algoritmo se fija en HS256: no se acepta el que diga el token (evita la confusión de algoritmos).
export async function verificarAccessToken(token: string): Promise<ClaimsAcceso> {
  const { payload } = await jwtVerify(token, clave, {
    algorithms: ['HS256'],
    issuer: emisor,
    audience: audiencia,
  });

  const { sub, sid, rol } = payload;
  if (
    typeof sub !== 'string' ||
    typeof sid !== 'string' ||
    !/^\d+$/.test(sid) ||
    !roles.includes(rol as Rol)
  ) {
    throw new Error('El access token no tiene los claims esperados');
  }
  return { usuarioId: sub, sesionId: BigInt(sid), rol: rol as Rol };
}

// Refresh token opaco: 256 bits aleatorios. En la BD solo se guarda su hash SHA-256.
export function generarRefreshToken(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}
