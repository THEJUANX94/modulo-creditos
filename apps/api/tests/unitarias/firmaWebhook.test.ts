import { describe, expect, it } from 'vitest';
import { firmarWebhook } from '../../src/modules/webhooks/firmaWebhook';

// Firma de Standard Webhooks (ADR 0018), contra el ejemplo publicado de la spec: si un receptor
// usa una librería de la spec, verifica nuestras firmas.

describe('firma Standard Webhooks', () => {
  const clave = Buffer.from('MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', 'base64');
  const id = 'msg_p5jXN8AQM9LWM0D4loKWxJek';
  const timestamp = 1614265330;
  const cuerpo = '{"test": 2432232314}';

  it('coincide con el ejemplo de la spec', () => {
    expect(firmarWebhook(clave, id, timestamp, cuerpo)).toBe(
      'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
    );
  });

  it('cambia si cambia el id, el timestamp, el cuerpo o la clave', () => {
    const original = firmarWebhook(clave, id, timestamp, cuerpo);
    expect(firmarWebhook(clave, `${id}x`, timestamp, cuerpo)).not.toBe(original);
    expect(firmarWebhook(clave, id, timestamp + 1, cuerpo)).not.toBe(original);
    expect(firmarWebhook(clave, id, timestamp, `${cuerpo} `)).not.toBe(original);
    expect(firmarWebhook(Buffer.from('otra clave'), id, timestamp, cuerpo)).not.toBe(original);
  });
});
