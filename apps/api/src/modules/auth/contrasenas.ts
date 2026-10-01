import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

// Argon2id (el algoritmo por defecto de la librería) con los parámetros mínimos que recomienda
// OWASP: 19 MiB de memoria, 2 iteraciones y 1 hilo.
const parametros = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashearContrasena(contrasena: string): Promise<string> {
  return hash(contrasena, parametros);
}

export async function verificarContrasena(
  hashGuardado: string,
  contrasena: string,
): Promise<boolean> {
  try {
    return await verify(hashGuardado, contrasena);
  } catch {
    return false;
  }
}

// Hash de una contraseña que nadie conoce. El login lo verifica cuando el correo no existe,
// para que el tiempo de respuesta no delate qué correos están registrados.
let hashFicticio: Promise<string> | undefined;

export function obtenerHashFicticio(): Promise<string> {
  hashFicticio ??= hashearContrasena(randomBytes(32).toString('hex'));
  return hashFicticio;
}
