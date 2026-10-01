// Crea el .env de la raíz (variables del docker-compose) con claves aleatorias (ADR 0022).
// Si .env ya existe, solo agrega las variables de .env.example que le falten: nunca cambia una que
// ya tiene, porque la clave de sa queda fijada en el volumen de SQL Server.
// Uso: pnpm env:generar  (Node ejecuta TypeScript directamente; no necesita dependencias)
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..');
const rutaEjemplo = path.join(raiz, '.env.example');
const rutaEnv = path.join(raiz, '.env');

// Claves de SQL Server: base64url (sin caracteres que rompan la cadena de conexión o la
// interpolación del compose) con mayúscula, minúscula y número, tres de los grupos que exige.
function claveSqlServer(): string {
  for (;;) {
    const clave = randomBytes(18).toString('base64url');
    if (/[A-Z]/.test(clave) && /[a-z]/.test(clave) && /\d/.test(clave)) return clave;
  }
}

// Las variables secretas y cómo se genera cada una. Las demás toman el valor de .env.example.
const generadores = new Map<string, () => string>([
  ['MSSQL_SA_PASSWORD', claveSqlServer],
  ['APP_DB_PASSWORD', claveSqlServer],
  ['JWT_SECRET', () => randomBytes(48).toString('base64url')],
  ['WEBHOOK_SECRETO', () => `whsec_${randomBytes(32).toString('base64')}`],
  ['USUARIOS_DEMO_CLAVE', () => randomBytes(12).toString('base64url')],
]);

const lineaVariable = /^([A-Z][A-Z0-9_]*)=(.*)$/;

// La línea de la variable, con la clave aleatoria si es un secreto y el valor de ejemplo si no.
function conValorFinal(linea: string): string {
  const nombre = lineaVariable.exec(linea)?.[1];
  const generar = nombre === undefined ? undefined : generadores.get(nombre);
  return nombre !== undefined && generar ? `${nombre}=${generar()}` : linea;
}

const ejemplo = readFileSync(rutaEjemplo, 'utf8').split('\n');

if (!existsSync(rutaEnv)) {
  writeFileSync(rutaEnv, ejemplo.map(conValorFinal).join('\n'));
  console.log('.env creado con claves aleatorias.');
} else {
  const existentes = new Set(
    readFileSync(rutaEnv, 'utf8')
      .split('\n')
      .map((linea) => lineaVariable.exec(linea.trim())?.[1])
      .filter(Boolean),
  );
  const faltantes = ejemplo.filter((linea) => {
    const nombre = lineaVariable.exec(linea)?.[1];
    return nombre !== undefined && !existentes.has(nombre);
  });

  if (faltantes.length === 0) {
    console.log('.env ya tiene todas las variables: no se cambió nada.');
  } else {
    const agregado = faltantes.map(conValorFinal).join('\n');
    writeFileSync(rutaEnv, `${readFileSync(rutaEnv, 'utf8').trimEnd()}\n\n${agregado}\n`);
    const nombres = faltantes.map((linea) => lineaVariable.exec(linea)?.[1]).join(', ');
    console.log(`Se agregaron a .env: ${nombres}.`);
  }
}

console.log('La contraseña de los usuarios demo está en USUARIOS_DEMO_CLAVE del .env.');
