import { describe, expect, it } from 'vitest';
import {
  esquemaCambiarEstado,
  esquemaCrearCredito,
  esquemaEditarCredito,
  esquemaEliminarCredito,
  esquemaFiltrosCreditos,
  esquemaTasaInteres,
  esquemaValorSolicitado,
} from '../src';

// Reglas de forma y rango de los créditos (ADR 0014, ADR 0017). Las que dependen de la BD
// (duplicados, catálogos activos) se prueban en la integración.

const version = '0x00000000000007E1';
const valido = {
  identificacionAsociado: '1001234567',
  nombreAsociado: 'Juan Perez',
  tipoCredito: 'LIBRE_INVERSION',
  valorSolicitado: 15000000,
  tasaInteres: 1.5,
  numeroCuotas: 36,
  formaPago: 'NOMINA',
};

const campos = (resultado: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  (resultado.error?.issues ?? []).map((issue) => issue.path.join('.')).sort();

describe('valorSolicitado', () => {
  it.each([
    [15000000, '15000000.00'],
    ['15000000', '15000000.00'],
    ['2500000.5', '2500000.50'],
    [' 0012.30 ', '12.30'],
    ['9999999999999999.99', '9999999999999999.99'],
  ])('%j se normaliza a %s, exacto', (entrada, salida) => {
    expect(esquemaValorSolicitado.parse(entrada)).toBe(salida);
  });

  it.each<{ entrada: number | string; caso: string }>([
    { entrada: 0, caso: 'cero' },
    { entrada: '0.00', caso: 'cero como string' },
    { entrada: -5, caso: 'negativo' },
    { entrada: 1.234, caso: 'tres decimales: no se redondea' },
    { entrada: '1e6', caso: 'exponente' },
    { entrada: '10000000000000000', caso: '17 dígitos enteros' },
    { entrada: 'abc', caso: 'texto' },
  ])('rechaza $entrada ($caso)', ({ entrada }) => {
    expect(esquemaValorSolicitado.safeParse(entrada).success).toBe(false);
  });
});

describe('tasaInteres', () => {
  it('acepta 0 y hasta 99.9999, con 4 decimales', () => {
    expect(esquemaTasaInteres.parse(0)).toBe('0.0000');
    expect(esquemaTasaInteres.parse('99.9999')).toBe('99.9999');
    expect(esquemaTasaInteres.parse(1.25)).toBe('1.2500');
  });

  it('rechaza 100 o más y más de 4 decimales', () => {
    expect(esquemaTasaInteres.safeParse(120).success).toBe(false);
    expect(esquemaTasaInteres.safeParse('1.23456').success).toBe(false);
  });
});

describe('crear crédito', () => {
  it('acepta el payload del enunciado, con CC por defecto', () => {
    const datos = esquemaCrearCredito.parse(valido);
    expect(datos.tipoIdentificacionAsociado).toBe('CC');
    expect(datos.valorSolicitado).toBe('15000000.00');
    expect(datos.tasaInteres).toBe('1.5000');
  });

  it('recorta y colapsa los espacios del nombre, y pasa los códigos a mayúsculas', () => {
    const datos = esquemaCrearCredito.parse({
      ...valido,
      nombreAsociado: '  Juan    Perez ',
      tipoCredito: ' libre_inversion ',
    });
    expect(datos.nombreAsociado).toBe('Juan Perez');
    expect(datos.tipoCredito).toBe('LIBRE_INVERSION');
  });

  it('con CC o NIT la identificación solo admite dígitos', () => {
    expect(
      campos(esquemaCrearCredito.safeParse({ ...valido, identificacionAsociado: '10A20' })),
    ).toEqual(['identificacionAsociado']);
    expect(
      esquemaCrearCredito.safeParse({
        ...valido,
        tipoIdentificacionAsociado: 'NIT',
        identificacionAsociado: '900A',
      }).success,
    ).toBe(false);
  });

  it('el formato de la identificación se informa aunque falten otros campos', () => {
    expect(campos(esquemaCrearCredito.safeParse({ identificacionAsociado: '10A20' }))).toContain(
      'identificacionAsociado',
    );
  });

  it('con pasaporte admite letras y números', () => {
    expect(
      esquemaCrearCredito.safeParse({
        ...valido,
        tipoIdentificacionAsociado: 'PA',
        identificacionAsociado: 'AB123456',
      }).success,
    ).toBe(true);
  });

  it('cuotas entre 1 y 360, enteras', () => {
    for (const numeroCuotas of [0, 361, 12.5]) {
      expect(campos(esquemaCrearCredito.safeParse({ ...valido, numeroCuotas }))).toEqual([
        'numeroCuotas',
      ]);
    }
  });

  it('un cuerpo vacío da un error por cada campo obligatorio', () => {
    expect(campos(esquemaCrearCredito.safeParse({}))).toEqual(
      expect.arrayContaining([
        'formaPago',
        'identificacionAsociado',
        'nombreAsociado',
        'numeroCuotas',
        'tasaInteres',
        'tipoCredito',
        'valorSolicitado',
      ]),
    );
  });
});

describe('editar, cambiar de estado y eliminar', () => {
  it('editar exige al menos un campo editable además de la versión', () => {
    expect(esquemaEditarCredito.safeParse({ version }).success).toBe(false);
    expect(esquemaEditarCredito.safeParse({ motivo: 'Solo motivo', version }).success).toBe(false);
    expect(esquemaEditarCredito.safeParse({ numeroCuotas: 24, version }).success).toBe(true);
  });

  it('la versión tiene el formato hexadecimal de ROWVERSION', () => {
    expect(esquemaEditarCredito.safeParse({ numeroCuotas: 24, version: '7E1' }).success).toBe(
      false,
    );
    expect(
      esquemaEliminarCredito.safeParse({ motivo: 'x', version: '0x0000000000000001' }).success,
    ).toBe(true);
  });

  it.each(['RECHAZADO', 'CANCELADO'])('%s exige observación', (estado) => {
    expect(campos(esquemaCambiarEstado.safeParse({ estado, version }))).toEqual(['observacion']);
    expect(esquemaCambiarEstado.safeParse({ estado, version, observacion: 'Motivo' }).success).toBe(
      true,
    );
  });

  it('EN_ESTUDIO no exige observación, y SOLICITADO no es un destino', () => {
    expect(esquemaCambiarEstado.safeParse({ estado: 'EN_ESTUDIO', version }).success).toBe(true);
    expect(esquemaCambiarEstado.safeParse({ estado: 'SOLICITADO', version }).success).toBe(false);
  });

  it('eliminar exige un motivo no vacío', () => {
    expect(campos(esquemaEliminarCredito.safeParse({ motivo: '   ', version }))).toEqual([
      'motivo',
    ]);
  });
});

describe('filtros del listado', () => {
  it('valores por defecto: página 1 de 20, por fecha descendente, sin eliminados', () => {
    expect(esquemaFiltrosCreditos.parse({})).toEqual({
      pagina: 1,
      tamanoPagina: 20,
      ordenarPor: 'fechaSolicitud',
      orden: 'desc',
      incluirEliminados: false,
    });
  });

  it('varios estados, separados por coma o repetidos', () => {
    expect(esquemaFiltrosCreditos.parse({ estado: 'solicitado, RECHAZADO' }).estado).toEqual([
      'SOLICITADO',
      'RECHAZADO',
    ]);
    expect(esquemaFiltrosCreditos.parse({ estado: ['APROBADO', 'CANCELADO'] }).estado).toEqual([
      'APROBADO',
      'CANCELADO',
    ]);
    expect(esquemaFiltrosCreditos.safeParse({ estado: 'PAGADO' }).success).toBe(false);
  });

  it('rechaza búsquedas de 1 carácter, orden fuera de la lista y más de 100 por página', () => {
    expect(esquemaFiltrosCreditos.safeParse({ busqueda: 'a' }).success).toBe(false);
    expect(esquemaFiltrosCreditos.safeParse({ ordenarPor: 'hashContrasena' }).success).toBe(false);
    expect(esquemaFiltrosCreditos.safeParse({ tamanoPagina: '101' }).success).toBe(false);
  });

  it('fechas AAAA-MM-DD, y la inicial no puede ser posterior a la final', () => {
    expect(esquemaFiltrosCreditos.safeParse({ fechaDesde: '01/10/2026' }).success).toBe(false);
    expect(
      esquemaFiltrosCreditos.safeParse({ fechaDesde: '2026-10-02', fechaHasta: '2026-10-01' })
        .success,
    ).toBe(false);
    expect(
      esquemaFiltrosCreditos.safeParse({ fechaDesde: '2026-10-01', fechaHasta: '2026-10-01' })
        .success,
    ).toBe(true);
  });

  it('incluirEliminados llega como texto y sale como booleano', () => {
    expect(esquemaFiltrosCreditos.parse({ incluirEliminados: 'true' }).incluirEliminados).toBe(
      true,
    );
    expect(esquemaFiltrosCreditos.safeParse({ incluirEliminados: 'si' }).success).toBe(false);
  });
});
