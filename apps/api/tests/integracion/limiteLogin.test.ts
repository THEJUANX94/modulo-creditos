import { describe, expect, it } from 'vitest';
import { api, claveUsuarios, correoDe, fallo } from './apoyo/ayudas';

// Rate limit del login (ADR 0016): 5 fallos por IP + correo y 20 intentos por IP, en ventanas de
// 15 minutos, sin bloquear cuentas. Va en su propio archivo: cada archivo carga su propia app, con
// sus contadores en cero.

const login = (correo: string, contrasena: string) =>
  api().post('/api/auth/login').send({ correo, contrasena });

describe('rate limit del login', () => {
  let intentos = 0;
  const intentar = async (correo: string, contrasena: string) => {
    intentos++;
    return login(correo, contrasena);
  };

  it('5 fallos sobre una cuenta y el siguiente intento → 429 con Retry-After', async () => {
    const estados: number[] = [];
    for (let i = 0; i < 5; i++) {
      estados.push((await intentar('fuerza.bruta@creditos.test', `intento-${i}`)).status);
    }
    expect(estados).toEqual([401, 401, 401, 401, 401]);

    const sexto = await intentar('fuerza.bruta@creditos.test', 'intento-5');
    expect(sexto.status).toBe(429);
    expect(fallo(sexto).code).toBe('DEMASIADAS_SOLICITUDES');
    expect(Number(sexto.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('otra cuenta desde la misma IP sigue pudiendo entrar (no se bloquean cuentas)', async () => {
    expect((await intentar(correoDe('ASESOR'), claveUsuarios())).status).toBe(200);
  });

  it('el intento 21 desde la misma IP → 429, exitoso o no', async () => {
    let primerBloqueo = 0;
    while (intentos < 30 && primerBloqueo === 0) {
      const res = await intentar(`otro.${intentos}@creditos.test`, 'cualquiera');
      if (res.status === 429) primerBloqueo = intentos;
    }
    expect(primerBloqueo).toBe(21);
  });
});
