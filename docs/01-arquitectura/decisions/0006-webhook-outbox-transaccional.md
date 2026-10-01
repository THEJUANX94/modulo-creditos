---
type: decision
tags: [adr, webhook, outbox, worker, integracion]
---

# ADR 0006: Webhook con outbox transaccional, worker en proceso aparte y mock receptor

## Estado

Aceptado (2026-09-30).

## Contexto

Cada vez que se crea un crédito, la aplicación tiene que notificar a un sistema externo con un `POST` del evento `credito.creado`. El enunciado pone tres condiciones:

- El webhook **reutiliza la lógica de creación**: no se duplican reglas de negocio ni se hace un segundo `INSERT` independiente.
- **Queda traza** de cada notificación.
- Hay que explicar **qué pasa si el sistema externo no responde, devuelve error o está fuera de servicio**.

Las dos formas ingenuas fallan:

- Si el `POST` se hace **dentro de la petición de creación**, una caída del sistema externo bloquea o tumba la creación del crédito.
- Si se hace **después del commit, en memoria**, un reinicio del proceso pierde el evento.

## Decisión

1. **Outbox transaccional.** El caso de uso de creación, el mismo que atiende `POST /api/creditos`, registra en la **misma transacción** del `INSERT` del crédito un evento `credito.creado` en estado `PENDIENTE`, en una tabla de outbox. O se guardan los dos o no se guarda ninguno. El webhook no tiene lógica de creación propia.
2. **Worker en proceso aparte.** Es otro entrypoint (`worker.ts`) del mismo código de `apps/api`. En Docker usa la misma imagen que la API, con otro comando. Lee los eventos pendientes y los envía por HTTP.
3. **Cada envío lleva** un `eventId`, para que el receptor deduplique, y una **firma HMAC** del cuerpo, para que verifique el origen.
4. **Reintentos con backoff exponencial.** Cada intento queda registrado (la traza). Después de N intentos fallidos, el evento pasa a `FALLIDO`.
5. **Mock receptor configurable** en el docker-compose. Verifica la firma, deduplica por `eventId` y se puede configurar para que falle o tarde, de modo que los reintentos se ven en vivo.

### Qué pasa cuando el sistema externo falla

| Situación | Qué pasa |
|---|---|
| No responde | El intento se corta por timeout, se registra como fallido y se reprograma con backoff |
| Devuelve error | El intento se registra con el código de respuesta y se reintenta |
| Está fuera de servicio | Los eventos se acumulan y salen cuando vuelve; los que agotan los N intentos quedan en `FALLIDO` |
| La API se cae después del commit | El evento ya está en la BD y el worker lo envía igual |

En todos los casos, **la creación del crédito no depende del webhook**: la API responde apenas confirma la transacción.

La entrega es **al menos una vez** (*at-least-once*). Un evento puede llegar dos veces, por ejemplo si el receptor lo procesó pero su respuesta se perdió. Por eso lleva `eventId`.

## Alternativas consideradas

- **Envío tras el commit con reintentos en memoria.** Es simple, pero si el proceso se reinicia durante los reintentos, el evento se pierde.
- **Cola en Redis (BullMQ).** Tiene reintentos nativos y escala, pero suma Redis, y entre el commit y el encolado sigue habiendo una ventana de pérdida.
- **Worker dentro de la API** (`setInterval` en el proceso de Express). Es lo más simple, pero al escalar la API cada réplica corre su propio worker y todos compiten por los mismos eventos.
- **Worker como app separada** (`apps/worker`). Aísla más, pero obliga a sacar la capa de datos y la lógica común a otro paquete compartido.
- **Solo la traza, sin receptor.** La prueba lo permite, pero así no se pueden demostrar la firma, la deduplicación ni los reintentos.

## Consecuencias

- **Positivas**:
  - La creación de créditos no depende de que el sistema externo esté disponible.
  - Ningún evento se pierde por una caída de la API o del sistema externo: queda en la BD hasta que se entrega o se marca `FALLIDO`.
  - La API queda sin estado y el worker escala por separado.
- **Costos aceptados**:
  - Al ser una entrega al menos una vez, el receptor tiene que ser idempotente.
  - La notificación no es instantánea: depende del intervalo con que el worker lee el outbox.
  - Si hay más de una réplica del worker, hay que evitar que dos tomen el mismo evento.

## Por definir en la implementación

- Las tablas del outbox y de los intentos.
- N (máximo de intentos), la base del backoff y el timeout de cada envío.
- Qué respuestas se reintentan; por ejemplo, si un 4xx se reintenta o pasa directo a `FALLIDO`.
- El intervalo de lectura del worker y cómo reclama eventos sin choques entre réplicas.
- El algoritmo y el header de la firma HMAC.
- Si existe un reenvío manual de los eventos `FALLIDO`.
- La configuración del mock receptor y dónde vive en el repositorio.

Última actualización: 2026-09-30
