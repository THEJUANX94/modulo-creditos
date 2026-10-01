import { describe, expect, it } from 'vitest';
import {
  estadosCredito,
  estadosDestino,
  estadosEnCurso,
  puede,
  puedeCambiarA,
  puedeTransicionar,
  roles,
  type EstadoCredito,
  type EstadoDestino,
  type Rol,
} from '../src';

// Máquina de estados (ADR 0014) y matriz de permisos (ADR 0016). La API las hace cumplir y el
// frontend las usa para mostrar solo las acciones válidas.

describe('transiciones', () => {
  const permitidas: [EstadoCredito, EstadoDestino][] = [
    ['SOLICITADO', 'EN_ESTUDIO'],
    ['SOLICITADO', 'RECHAZADO'],
    ['SOLICITADO', 'CANCELADO'],
    ['EN_ESTUDIO', 'APROBADO'],
    ['EN_ESTUDIO', 'RECHAZADO'],
    ['EN_ESTUDIO', 'CANCELADO'],
    ['APROBADO', 'DESEMBOLSADO'],
    ['APROBADO', 'CANCELADO'],
  ];
  const esPermitida = (desde: EstadoCredito, hacia: EstadoDestino) =>
    permitidas.some(([d, h]) => d === desde && h === hacia);

  it.each(
    estadosCredito.flatMap((desde) => estadosDestino.map((hacia) => [desde, hacia] as const)),
  )('%s → %s', (desde, hacia) => {
    expect(puedeTransicionar(desde, hacia)).toBe(esPermitida(desde, hacia));
  });

  it('RECHAZADO → DESEMBOLSADO, el ejemplo del enunciado, no es válida', () => {
    expect(puedeTransicionar('RECHAZADO', 'DESEMBOLSADO')).toBe(false);
  });

  it('los estados finales no salen a ninguna parte', () => {
    for (const final of ['RECHAZADO', 'DESEMBOLSADO', 'CANCELADO'] as const) {
      expect(estadosDestino.filter((hacia) => puedeTransicionar(final, hacia))).toEqual([]);
    }
  });

  it('en curso son SOLICITADO, EN_ESTUDIO y APROBADO', () => {
    expect([...estadosEnCurso]).toEqual(['SOLICITADO', 'EN_ESTUDIO', 'APROBADO']);
  });
});

describe('permisos', () => {
  const quienes = (condicion: (rol: Rol) => boolean) => roles.filter(condicion);

  it('todos ven créditos; crean, editan y eliminan ASESOR y ADMIN', () => {
    expect(quienes((rol) => puede(rol, 'verCreditos'))).toEqual([...roles]);
    for (const accion of ['crearCredito', 'editarCredito', 'eliminarCredito'] as const) {
      expect(quienes((rol) => puede(rol, accion)).sort()).toEqual(['ADMIN', 'ASESOR']);
    }
  });

  it('solo ADMIN ve eliminados, la traza del webhook y los usuarios', () => {
    for (const accion of ['verEliminados', 'verTrazaWebhook', 'gestionarUsuarios'] as const) {
      expect(quienes((rol) => puede(rol, accion))).toEqual(['ADMIN']);
    }
  });

  it.each([
    ['EN_ESTUDIO', ['ADMIN', 'ANALISTA']],
    ['APROBADO', ['ADMIN', 'ANALISTA']],
    ['RECHAZADO', ['ADMIN', 'ANALISTA']],
    ['DESEMBOLSADO', ['ADMIN', 'TESORERIA']],
    ['CANCELADO', ['ADMIN', 'ANALISTA', 'ASESOR']],
  ] as const)('llevan a %s: %j', (estado, esperados) => {
    expect(quienes((rol) => puedeCambiarA(rol, estado)).sort()).toEqual([...esperados]);
  });
});
