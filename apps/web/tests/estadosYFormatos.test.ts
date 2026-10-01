import type { Credito, EstadoCredito, Rol } from '@creditos/shared';
import { describe, expect, it } from 'vitest';
import { accionesDisponibles } from '@/lib/estados';
import {
  formatearFecha,
  formatearFechaHora,
  formatearMonto,
  montoDesdeCampo,
  montoParaCampo,
} from '@/lib/formatos';

const credito = (estado: EstadoCredito, eliminado = false): Credito => ({
  id: '9c41a2b3-c4d5-4e6f-8a7b-9c0d1e2f3a4b',
  numeroCredito: 'CR-2026-000123',
  tipoIdentificacionAsociado: 'CC',
  identificacionAsociado: '1001234567',
  nombreAsociado: 'Juan Perez',
  tipoCredito: 'LIBRE_INVERSION',
  valorSolicitado: '15000000.00',
  tasaInteres: '1.5000',
  numeroCuotas: 36,
  formaPago: 'NOMINA',
  estado,
  fechaSolicitud: '2026-10-01T15:04:05.123Z',
  fechaActualizacion: '2026-10-01T15:04:05.123Z',
  version: '0x00000000000007E1',
  ...(eliminado && {
    eliminacion: { fecha: '2026-10-01T16:00:00.000Z', usuarioNombre: 'Asesor Demo', motivo: 'x' },
  }),
});

const etiquetas = (estado: EstadoCredito, rol: Rol) =>
  accionesDisponibles(credito(estado), rol).map((accion) => accion.etiqueta);

describe('acciones visibles por estado y rol (ADR 0021)', () => {
  it.each([
    ['SOLICITADO', 'ANALISTA', ['Pasar a estudio', 'Rechazar', 'Cancelar crédito']],
    ['SOLICITADO', 'ASESOR', ['Cancelar crédito']],
    ['SOLICITADO', 'TESORERIA', []],
    ['EN_ESTUDIO', 'ANALISTA', ['Aprobar', 'Rechazar', 'Cancelar crédito']],
    ['APROBADO', 'TESORERIA', ['Desembolsar']],
    ['APROBADO', 'ANALISTA', ['Cancelar crédito']],
    ['RECHAZADO', 'ADMIN', []],
    ['DESEMBOLSADO', 'ADMIN', []],
  ] as const)('%s con %s → %j', (estado, rol, esperadas) => {
    expect(etiquetas(estado, rol)).toEqual(esperadas);
  });

  it('rechazar y cancelar son destructivas y piden motivo; aprobar no', () => {
    const acciones = accionesDisponibles(credito('EN_ESTUDIO'), 'ADMIN');
    expect(acciones.map((a) => [a.destino, a.destructiva, a.pideObservacion])).toEqual([
      ['APROBADO', false, false],
      ['RECHAZADO', true, true],
      ['CANCELADO', true, true],
    ]);
  });

  it('un crédito eliminado no tiene acciones', () => {
    expect(accionesDisponibles(credito('SOLICITADO', true), 'ADMIN')).toEqual([]);
  });
});

// Intl separa el símbolo con un espacio no separable: se normaliza para comparar.
const texto = (valor: string) => valor.replace(/\s/g, ' ');

describe('formatos en pesos colombianos y hora de Colombia', () => {
  it('montos sin centavos si son ,00, con centavos si no', () => {
    expect(texto(formatearMonto('15000000.00'))).toBe('$ 15.000.000');
    expect(texto(formatearMonto('2500000.50'))).toBe('$ 2.500.000,50');
  });

  it('el máximo de DECIMAL(18,2) se muestra exacto, sin pasar por un número binario', () => {
    expect(texto(formatearMonto('9999999999999999.99'))).toBe('$ 9.999.999.999.999.999,99');
  });

  it('el campo muestra los miles y la coma, y a la API viaja el string exacto', () => {
    expect(montoParaCampo('25000000,5')).toBe('25.000.000,5');
    expect(montoDesdeCampo('25.000.000,5')).toBe('25000000.5');
    expect(montoParaCampo('$ 1a2b3')).toBe('123');
    expect(montoParaCampo('1,999')).toBe('1,99');
  });

  it('las fechas van en hora de Colombia (UTC-5) y con el mes en letras', () => {
    // 01:30 UTC del 2 de octubre son las 20:30 del 1 de octubre en Bogotá.
    expect(formatearFecha('2026-10-02T01:30:00.000Z')).toBe('1 de oct de 2026');
    expect(texto(formatearFechaHora('2026-10-02T01:30:00.000Z'))).toContain('8:30');
  });
});
