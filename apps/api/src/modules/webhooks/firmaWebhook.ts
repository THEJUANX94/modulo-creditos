import { createHmac } from 'node:crypto';

// Firma de Standard Webhooks (standardwebhooks.com, ADR 0018): HMAC-SHA256 sobre
// "webhook-id.webhook-timestamp.cuerpo", en base64 y con el prefijo de versión v1. El timestamp
// del envío va firmado: el receptor rechaza una petición capturada que se repita más tarde.
export function firmarWebhook(
  clave: Buffer,
  webhookId: string,
  timestamp: number,
  cuerpo: string,
): string {
  const firma = createHmac('sha256', clave)
    .update(`${webhookId}.${timestamp}.${cuerpo}`)
    .digest('base64');
  return `v1,${firma}`;
}
