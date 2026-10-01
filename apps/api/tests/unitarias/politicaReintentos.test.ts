import { describe, expect, it } from 'vitest';
import {
  esperaTrasIntento,
  esStatusReintentable,
} from '../../src/modules/webhooks/politicaReintentos';

// Qué se reintenta y cuánto se espera (ADR 0018).

describe('qué status se reintentan', () => {
  it.each([408, 429, 500, 502, 503, 504])('%i: sí, es temporal', (status) => {
    expect(esStatusReintentable(status)).toBe(true);
  });

  it.each([301, 302, 307, 400, 401, 403, 404, 410, 422])('%i: no, es definitivo', (status) => {
    expect(esStatusReintentable(status)).toBe(false);
  });
});

describe('backoff exponencial con jitter', () => {
  const sinJitter = () => 0.5;

  it('base × 2^(n-1): 10 s, 20 s, 40 s, 80 s, 160 s', () => {
    expect([1, 2, 3, 4, 5].map((n) => esperaTrasIntento(n, 10_000, sinJitter))).toEqual([
      10_000, 20_000, 40_000, 80_000, 160_000,
    ]);
  });

  it('el jitter mueve la espera ±20 %', () => {
    expect(esperaTrasIntento(1, 10_000, () => 0)).toBe(8_000);
    expect(esperaTrasIntento(1, 10_000, () => 1)).toBe(12_000);
    for (let i = 0; i < 100; i++) {
      const espera = esperaTrasIntento(3, 10_000);
      expect(espera).toBeGreaterThanOrEqual(32_000);
      expect(espera).toBeLessThanOrEqual(48_000);
    }
  });

  it('nunca pasa de 24 h, el tope que admite DATEADD(MILLISECOND)', () => {
    expect(esperaTrasIntento(20, 3_600_000, sinJitter)).toBe(24 * 60 * 60 * 1000);
  });
});
