import { describe, expect, it } from 'vitest';
import {
  esquemaCambioContrasena,
  esquemaContrasenaNueva,
  esquemaCrearUsuario,
  esquemaEventoCreditoCreado,
  esquemaFiltrosEventosWebhook,
  esquemaLogin,
  esquemaPaginacion,
} from '../src';

describe('autenticación y usuarios (ADR 0016)', () => {
  it('contraseña nueva: de 12 a 128 caracteres, sin reglas de composición', () => {
    expect(esquemaContrasenaNueva.safeParse('a'.repeat(11)).success).toBe(false);
    expect(esquemaContrasenaNueva.safeParse('solo minusculas largas').success).toBe(true);
    expect(esquemaContrasenaNueva.safeParse('a'.repeat(129)).success).toBe(false);
  });

  it('el login normaliza el correo a minúsculas y no aplica la política', () => {
    expect(esquemaLogin.parse({ correo: 'ASESOR@Creditos.TEST', contrasena: 'x' }).correo).toBe(
      'asesor@creditos.test',
    );
    expect(
      esquemaLogin.safeParse({ correo: 'no-es-correo', contrasena: '' }).error?.issues,
    ).toHaveLength(2);
  });

  it('la contraseña nueva tiene que ser distinta de la actual', () => {
    expect(
      esquemaCambioContrasena.safeParse({
        contrasenaActual: 'MismaClave2026',
        contrasenaNueva: 'MismaClave2026',
      }).success,
    ).toBe(false);
  });

  it('la contraseña temporal no puede ser el correo, y el rol tiene que existir', () => {
    const base = { correo: 'nuevo.usuario@creditos.test', nombre: 'Nuevo', rol: 'ASESOR' };
    expect(
      esquemaCrearUsuario.safeParse({ ...base, contrasenaTemporal: 'NUEVO.usuario@creditos.test' })
        .success,
    ).toBe(false);
    expect(
      esquemaCrearUsuario.safeParse({
        ...base,
        rol: 'JEFE',
        contrasenaTemporal: 'TemporalSegura2026',
      }).success,
    ).toBe(false);
  });

  it('paginación: desde 1 y hasta 100 por página', () => {
    expect(esquemaPaginacion.safeParse({ pagina: '0' }).success).toBe(false);
    expect(esquemaPaginacion.parse({ pagina: '3', tamanoPagina: '100' })).toEqual({
      pagina: 3,
      tamanoPagina: 100,
    });
  });
});

describe('evento credito.creado (ADR 0018)', () => {
  const evento = {
    event: 'credito.creado',
    eventId: '5b0e2a3c-1d4e-4f5a-8b6c-7d8e9f0a1b2c',
    timestamp: '2026-10-01T18:00:00.000Z',
    data: {
      id: '9c41a2b3-c4d5-4e6f-8a7b-9c0d1e2f3a4b',
      numeroCredito: 'CR-2026-000123',
      tipoIdentificacionAsociado: 'CC',
      identificacionAsociado: '1001234567',
      tipoCredito: 'LIBRE_INVERSION',
      valorSolicitado: '15000000.00',
      estado: 'SOLICITADO',
    },
  };

  it('acepta el contrato', () => {
    expect(esquemaEventoCreditoCreado.safeParse(evento).success).toBe(true);
  });

  it('el monto va como string, y un crédito recién creado solo puede estar en SOLICITADO', () => {
    expect(
      esquemaEventoCreditoCreado.safeParse({
        ...evento,
        data: { ...evento.data, valorSolicitado: 15000000 },
      }).success,
    ).toBe(false);
    expect(
      esquemaEventoCreditoCreado.safeParse({
        ...evento,
        data: { ...evento.data, estado: 'APROBADO' },
      }).success,
    ).toBe(false);
  });

  it('los filtros de la traza: estado del evento y crédito por UUID', () => {
    expect(esquemaFiltrosEventosWebhook.safeParse({ estado: 'FALLIDO' }).success).toBe(true);
    expect(esquemaFiltrosEventosWebhook.safeParse({ estado: 'OTRO' }).success).toBe(false);
    expect(esquemaFiltrosEventosWebhook.safeParse({ creditoId: '123' }).success).toBe(false);
  });
});
