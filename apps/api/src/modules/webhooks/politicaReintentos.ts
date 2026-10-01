// Política de reintentos del webhook (ADR 0018). Funciones puras: se prueban sin red ni BD.

// Solo se reintenta lo que puede arreglarse solo: 408, 429 y 5xx (además del timeout y el error
// de red, que no tienen status). Otro 4xx, o un 3xx (las redirecciones no se siguen), es definitivo.
export function esStatusReintentable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

const factorJitter = 0.2;
// Tope técnico: DATEADD(MILLISECOND) admite un INT. Con los valores por defecto nunca se alcanza.
const esperaMaximaMs = 24 * 60 * 60 * 1000;

// Espera antes del intento siguiente al n-ésimo fallido: base × 2^(n-1), ±20 %. Con base 10 s:
// 10 s, 20 s, 40 s, 80 s, 160 s. El jitter evita que los eventos que fallaron juntos (por una
// caída del receptor) vuelvan a salir todos en el mismo instante.
export function esperaTrasIntento(
  intentoFallido: number,
  baseMs: number,
  aleatorio: () => number = Math.random,
): number {
  const espera = baseMs * 2 ** (intentoFallido - 1);
  const jitter = 1 + (aleatorio() * 2 - 1) * factorJitter;
  return Math.round(Math.min(espera * jitter, esperaMaximaMs));
}
