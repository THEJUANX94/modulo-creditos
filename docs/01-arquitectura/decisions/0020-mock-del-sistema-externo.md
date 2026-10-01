---
type: decision
tags: [adr, webhook, mock, standard-webhooks, demo]
---

# ADR 0020: Mock del sistema externo

## Estado

Aceptado (2026-10-01). Implementado en el paso 6 y verificado con procesos reales (mock, worker y API): 22 pruebas.

## Contexto

El [ADR 0006](0006-webhook-outbox-transaccional.md) decidió un mock receptor configurable, para que la firma, la deduplicación y los reintentos se vean en vivo y no solo en la traza. El enunciado permite "solo guardar la traza", pero pide explicar qué pasa si el sistema externo no responde, devuelve error o está fuera de servicio: el mock lo muestra en la socialización.

## Decisión

### Qué hace

`apps/webhookMock` simula lo que hay detrás de `https://sistema-externo.com/webhooks/creditos`. Ante cada `POST /webhooks/creditos`:

1. **Verifica la firma con la librería oficial de Standard Webhooks** (`standardwebhooks`), incluida su ventana de 5 minutos. Si falla: **401**.
2. **Valida el payload** con el mismo esquema Zod con que la API lo arma (`esquemaEventoCreditoCreado`), y que `webhook-id` sea el `eventId` del cuerpo. Si no: **400**.
3. **Deduplica por `webhook-id`.** Un evento ya procesado responde **200** sin procesarlo otra vez, y queda marcado como duplicado.
4. **Responde según el modo** configurado. Solo se aplica a las peticiones válidas.

### Modos

| Modo | Respuesta | Qué muestra en la API |
|---|---|---|
| `acepta` | 200 | `ENTREGADO` al primer intento |
| `falla` | 503 | Reintentos con backoff y, al agotarlos, `FALLIDO` |
| `rechaza` | 400 | `FALLIDO` de inmediato, con el motivo del receptor en la traza |
| `lento` | 200, después de `MOCK_RETRASO_MS` (20 s) | `TIMEOUT`. El mock sí procesó el evento, así que el reintento llega como duplicado: la entrega al menos una vez |
| `intermitente` | 503 o 200 al azar (50 %) | Una mezcla de reintentos y entregas |
| `fallaPrimeros` | 503 en los primeros N envíos de cada evento, después 200 | Un reintento que termina `ENTREGADO`, sin azar |

"Fuera de servicio" se muestra deteniendo el mock: `ERROR_RED` con `ECONNREFUSED` y, cuando vuelve, la entrega.

### Control y visibilidad

- **`MOCK_MODO` fija el modo al arrancar**, y `PUT /control` (`{ modo, fallasPorEvento }`) lo cambia en vivo, sin reiniciar.
- **`GET /`** muestra una página que se refresca cada 2 s: el modo, con botones para cambiarlo, los totales y las últimas peticiones (respuesta, crédito, valor, número de envío, `webhook-id` y `requestId`). Usa los colores del [design system](../../05-frontend/design-system.md), en claro y oscuro, y pinta todo con `textContent`: nada de lo recibido se interpreta como HTML.
- **`GET /recibidos`** devuelve lo mismo en JSON, y **`GET /salud`** sirve al healthcheck del compose.
- **Cada petición queda en la consola**: `[mock] 503 falla webhook-id=… envío=2 modo=falla`.

### Implementación

- **`node:http`, sin framework.** Tres rutas no justifican Express. El cuerpo se lee crudo, porque la firma se verifica sobre los bytes exactos, con un tope de 100 KB (413).
- **Todo en memoria.** Es un simulador: al reiniciar empieza vacío. La deduplicación guarda todos los `webhook-id` procesados en esa ejecución, y la página, las últimas 200 peticiones.
- **Configuración validada con Zod** al arrancar: `PORT` (4000), `WEBHOOK_SECRETO` (el mismo del worker), `MOCK_MODO`, `MOCK_FALLAS_POR_EVENTO` y `MOCK_RETRASO_MS`.
- **Se ejecuta como la API**: `tsx` en desarrollo y bundle con tsup (con `@creditos/shared` incluido) para la imagen de Docker.

## Alternativas consideradas

- **Verificar la firma con `node:crypto`**: muestra cómo funciona por dentro, pero el mismo equipo firmaría y verificaría. Con la librería oficial queda probado que un receptor cualquiera verifica nuestras firmas.
- **Express 5, como la API**: mismos patrones, pero una dependencia más para tres rutas.
- **Solo la variable de entorno, o solo la ruta de control**: cada cambio exigiría reiniciar, o el mock arrancaría siempre aceptando.
- **Solo JSON, o solo logs**: la demo sería menos visual.
- **Solo los modos acepta, falla y lento**: no mostrarían el rechazo definitivo ni un reintento que termina bien de forma predecible.
- **Un 409 para los duplicados**: para el worker, un 409 es un rechazo definitivo, así que un evento que el receptor sí procesó quedaría `FALLIDO`.
- **Guardar en un archivo JSON**: sobrevive a reinicios, pero agrega escritura a disco y un volumen. Un sistema externo real tendría su propia BD.
- **Pruebas automatizadas del mock**: se decidió verificarlo a mano. Las pruebas del worker ya usan su propio receptor (`receptorWebhook.ts`, [ADR 0019](0019-implementacion-de-las-pruebas.md)).

## Consecuencias

- **Positivas**:
  - Cada fila de la tabla "qué pasa cuando el sistema externo falla" del [ADR 0018](0018-webhook-entrega-firma-y-traza.md) se puede mostrar en vivo, con la traza de la API y la página del mock lado a lado.
  - La interoperabilidad de la firma queda demostrada con una librería que no escribimos.
- **Costos aceptados**:
  - `PUT /control` no tiene autenticación: el mock es un simulador de la red interna y no se publica.
  - Al reiniciar se pierden los `webhook-id` procesados: un reintento posterior se procesaría como nuevo.
  - Sin pruebas automatizadas propias; su verificación es la de este ADR.

## Verificación (2026-10-01)

**22 pruebas con procesos reales**: el mock, el worker y la API compilados, contra la BD de desarrollo, con el worker en valores cortos (4 intentos, base de 300 ms, timeout de 1,5 s) y el modo lento en 3 s.

- **Cada modo, cambiado en vivo con `PUT /control`:**
  - `acepta`: `ENTREGADO`; el mock registró el crédito, el valor y el `requestId`.
  - `falla`: 4 envíos con 503, numerados en el mock, y `FALLIDO`.
  - `rechaza`: `FALLIDO` con el motivo del receptor en la traza.
  - `lento`: `TIMEOUT`, y el reintento llega como duplicado y queda `ENTREGADO`.
  - `fallaPrimeros` con N = 2: 503, 503 y 200.
  - `intermitente`: una mezcla de 503 y 200, con todos los eventos en estado final.
- **Fuera de servicio**: con el mock detenido, `ERROR_RED`; cuando vuelve, `ENTREGADO`.
- **Peticiones directas:**
  - cuerpo alterado después de firmar: 401;
  - firma válida de hace 10 minutos: 401;
  - payload fuera del contrato: 400;
  - `webhook-id` distinto del `eventId`: 400;
  - reenvío de un evento procesado: 200 duplicado.
- **Rutas:** la página, `/recibidos` con sus totales, `PUT /control` inválido (400), una ruta inexistente (404) y un cuerpo de 200 KB (413).
- **Página en el navegador**, en claro y oscuro, sin errores de consola. Los controles se crean una sola vez: el refresco no le quita el foco a quien navega con el teclado.

## Por definir en la implementación

Resuelto en el [ADR 0022](0022-docker-compose-y-empaquetado.md): el servicio `webhookMock` del compose, con su healthcheck en `/salud` y la página publicada en el puerto 4000. El worker le envía a `http://webhookMock:4000/webhooks/creditos`.

Última actualización: 2026-10-01
