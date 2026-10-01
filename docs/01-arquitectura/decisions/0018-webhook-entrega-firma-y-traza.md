---
type: decision
tags: [adr, webhook, worker, outbox, firma, hmac, reintentos, standard-webhooks]
---

# ADR 0018: Webhook — contrato, firma, entrega y traza

## Estado

Aceptado (2026-10-01). Implementado en el paso 4d y verificado de punta a punta contra la API y el worker compilados: 51 pruebas.

## Contexto

El [ADR 0006](0006-webhook-outbox-transaccional.md) fijó la estrategia: un outbox transaccional, un worker en proceso aparte, firma HMAC, reintentos con backoff y la traza de cada intento. Las tablas `WebhookEventos` y `WebhookIntentos` ya existían ([ADR 0013](0013-modelo-de-datos.md)). Quedaban por definir:

- el contrato del evento;
- la firma;
- la política de reintentos;
- cómo reclama el worker los eventos sin que dos réplicas envíen el mismo;
- cómo se consulta la traza.

El enunciado pide reutilizar la lógica de creación, sin un segundo `INSERT`; dejar traza de la notificación; y explicar qué pasa si el sistema externo no responde, devuelve error o está fuera de servicio.

## Decisión

### Contrato del evento

`event`, `eventId`, `timestamp` y `data` van como en el enunciado. `data` lleva los cinco campos del enunciado más `tipoIdentificacionAsociado` y `tipoCredito`:

```json
{
  "event": "credito.creado",
  "eventId": "5b0e…",
  "timestamp": "2026-10-01T18:00:00.000Z",
  "data": {
    "id": "9c41…",
    "numeroCredito": "CR-2026-000123",
    "tipoIdentificacionAsociado": "CC",
    "identificacionAsociado": "1001234567",
    "tipoCredito": "LIBRE_INVERSION",
    "valorSolicitado": "15000000.00",
    "estado": "SOLICITADO"
  }
}
```

- **`tipoIdentificacionAsociado`**: la identificación sola es ambigua. Un asociado se identifica por tipo y número (CC 123 y NIT 123 son personas distintas).
- **Sin el nombre ni las condiciones financieras**: se aplica la minimización de datos personales de la Ley 1581.
- **`id` es el UUID público** del crédito ([ADR 0013](0013-modelo-de-datos.md)), no un consecutivo.
- **`valorSolicitado` va como string exacto**, igual que en la API ([ADR 0015](0015-contrato-http-y-base-de-la-api.md)). `DECIMAL(18,2)` admite valores por encima de 2^53, donde un número JSON pierde precisión.
- **`timestamp` es la `fechaSolicitud` del crédito**, no el momento del envío. Así, cada reintento envía exactamente el mismo cuerpo.
- **El esquema Zod vive en `@creditos/shared`** (`eventoCreditoCreado.ts`). La API lo usa para armar el evento, el mock para validarlo y Swagger para documentarlo.

### Registro: la misma transacción que el crédito

`creditosService.crear` llama a `webhooksService.registrarCreditoCreado` dentro de su transacción, con el crédito ya leído. El evento se guarda en el outbox con su `eventId` (UUID generado por la API), su `requestId` y su payload serializado. Ese payload es lo que se envía, byte por byte, en cada intento.

O se guardan el crédito y el evento, o no se guarda ninguno. El webhook no tiene lógica de creación propia.

### Firma: Standard Webhooks

Se sigue la spec pública de [Standard Webhooks](https://www.standardwebhooks.com/):

| Header | Valor |
|---|---|
| `webhook-id` | El `eventId`. No cambia entre reintentos: el receptor deduplica con él |
| `webhook-timestamp` | Segundos Unix **del envío** |
| `webhook-signature` | `v1,<base64>`: HMAC-SHA256 sobre `webhook-id.webhook-timestamp.cuerpo` |
| `x-request-id` | El requestId de la petición que creó el crédito (pendiente del [ADR 0010](0010-logs-tecnicos-y-auditoria.md)) |

- **El timestamp va firmado**: el receptor rechaza una petición capturada que se repita más tarde. La spec deja la ventana a criterio del receptor; el mock usará 5 minutos.
- **El secreto tiene el formato de la spec**: `whsec_` + base64, de al menos 32 bytes decodificados. Si no cumple, el worker no arranca.
- **El `requestId` viaja al receptor.** Si el sistema externo reporta un problema con ese id, se encuentra toda la cadena: petición, crédito, evento e intentos. Es un id opaco, sin datos personales.

### Entrega y reintentos

| Respuesta | Resultado en la traza | Qué pasa |
|---|---|---|
| 2xx | `EXITOSO` | `ENTREGADO`, con `fechaEntrega` |
| 408, 429 o 5xx | `ERROR_HTTP` | Se reintenta con backoff |
| Sin respuesta dentro del timeout | `TIMEOUT` | Se reintenta con backoff |
| Error de red (conexión rechazada o cortada) | `ERROR_RED` | Se reintenta con backoff |
| Cualquier otro 4xx, o un 3xx | `ERROR_HTTP` | `FALLIDO` de inmediato: no se arregla solo |

- **6 intentos**, con esperas de base × 2^(n−1) y jitter de ±20 %. Con la base de 10 s: 10 s, 20 s, 40 s, 80 s y 160 s, unos 5 minutos en total. En la demo se ve el ciclo completo hasta `FALLIDO`. El jitter evita que los eventos que fallaron juntos, por una caída del receptor, vuelvan a salir todos en el mismo instante.
- **Timeout de 15 s** por intento, el mínimo que sugiere la spec (15 a 30 s).
- **Las redirecciones no se siguen** (`redirect: 'manual'`). Seguirlas mandaría el payload firmado a otro host.
- **La columna `error`** guarda, en `TIMEOUT` y `ERROR_RED`, el código y el mensaje (por ejemplo `ECONNREFUSED`). En `ERROR_HTTP` guarda los primeros 500 caracteres de la respuesta, que suelen decir por qué la rechazó. La respuesta se lee con un tope de 2 KB.
- **Sin reenvío manual.** Un evento `FALLIDO` queda así, con su traza completa. Ver las alternativas.

Todo es configurable por variables (`WEBHOOK_MAX_INTENTOS`, `WEBHOOK_BACKOFF_BASE_MS`, `WEBHOOK_TIMEOUT_MS`, `WEBHOOK_INTERVALO_MS`). La política vive en `politicaReintentos.ts`, como funciones puras.

### Worker

- **Cómo reclama los eventos: un `UPDATE` atómico con lease**, sin columnas nuevas:

  ```sql
  UPDATE e SET intentos = e.intentos + 1, proximoIntento = DATEADD(SECOND, 60, SYSUTCDATETIME())
  OUTPUT INSERTED.…
  FROM dbo.WebhookEventos AS e
  WHERE e.id IN (
    SELECT TOP (10) id
    FROM dbo.WebhookEventos WITH (UPDLOCK, READPAST, ROWLOCK, INDEX(IX_WebhookEventos_pendientes))
    WHERE estado = N'PENDIENTE' AND proximoIntento <= SYSUTCDATETIME()
    ORDER BY proximoIntento
  )
  ```

  - **`READPAST`**: otra réplica salta las filas tomadas en vez de esperarlas, así que dos workers nunca envían el mismo evento.
  - **El `TOP` va en una subconsulta que solo lee el índice filtrado.** `UPDLOCK` retiene el bloqueo de cada fila que lee hasta el final de la sentencia: un plan que leyera todos los pendientes los bloquearía todos, y la otra réplica no tomaría ninguno. Lo encontró la suite del paso 5 ([ADR 0019](0019-implementacion-de-las-pruebas.md)).
  - **Lease de 60 s**: si un worker muere a mitad, el evento reaparece cuando vence. Es mayor que el timeout máximo permitido (30 s).
  - **El intento cuenta al tomarlo.** Si el worker muere, ese número queda como un hueco visible en la traza.
  - **El resultado solo cambia el evento si sigue siendo de ese reclamo** (`intentos` igual al número del intento). Si el lease venció y otro worker lo retomó, el intento queda en la traza pero no pisa el estado.
- **Lectura**: cada 2 s, en lotes de 10, enviados en paralelo con un timeout cada uno. Si el lote sale lleno, vuelve a leer sin esperar. La consulta usa el índice filtrado `IX_WebhookEventos_pendientes`.
- **Cliente HTTP: `fetch` nativo de Node 24**, sin dependencias nuevas.
- **Logs**: cada envío se registra con el requestId de la petición que creó el crédito: `info` si se entrega, `warn` si se reprograma y `error` si queda `FALLIDO`, con el motivo. El cuerpo de un rechazo no va al log, porque podría repetir datos del payload; queda en la traza.
- **Apagado ordenado**: con `SIGTERM`, deja de tomar eventos y espera a que el lote en curso registre su resultado, con un máximo de 20 s. Docker espera 10 s por defecto, así que el compose del paso 8 fija `stop_grace_period: 25s`. Si aun así muere a mitad, el lease devuelve el evento.

### Configuración separada por proceso

`config/configBase.ts` valida las variables comunes (`NODE_ENV`, `LOG_LEVEL`, `DATABASE_URL`). Además, `config/config.ts` valida las de la API y `config/configWorker.ts` las del worker. Cada proceso exige y recibe solo sus secretos: la API nunca tiene `WEBHOOK_SECRETO`, y el worker nunca tiene `JWT_SECRET`. `WEBHOOK_URL` tiene que ser https con `NODE_ENV=production`; en desarrollo y pruebas se admite http.

### Traza en la API

Solo para ADMIN (`verTrazaWebhook`, [ADR 0016](0016-autenticacion-sesiones-y-permisos.md)) y solo de lectura:

| Método y ruta | Qué hace |
|---|---|
| `GET /api/webhooks/eventos` | Eventos paginados, lo más reciente primero. Filtros por `estado` y por `creditoId` |
| `GET /api/webhooks/eventos/{eventId}` | El evento con su payload y cada intento, lo más reciente primero |

- **Se identifica por el `eventId`** (UUID), no por el `BIGINT` interno.
- **El detalle del crédito en el frontend usa el filtro por crédito**, y los `FALLIDO` se ven en una sola consulta.
- **Swagger documenta el evento en la sección `webhooks`** de OpenAPI 3.1, con los headers de la firma y el esquema del payload.

### Qué pasa cuando el sistema externo falla

| Situación | Qué pasa |
|---|---|
| No responde | A los 15 s el intento queda como `TIMEOUT` y se reprograma con backoff |
| Devuelve 5xx, 408 o 429 | Queda como `ERROR_HTTP`, con el status y el inicio de la respuesta, y se reintenta |
| Devuelve otro 4xx | `FALLIDO` de inmediato, con el motivo que dio el receptor en la traza |
| Está fuera de servicio | Cada intento queda como `ERROR_RED` (`ECONNREFUSED`). Si vuelve antes del sexto intento, el evento se entrega; si no, queda `FALLIDO` |
| El worker muere a mitad del envío | Otro worker retoma el evento al vencer el lease. El receptor puede recibirlo dos veces con el mismo `webhook-id` |
| La API se cae después del commit | El evento ya está en el outbox y el worker lo envía igual |

En todos los casos, **la creación del crédito no depende del webhook**: la API responde apenas confirma la transacción.

## Alternativas consideradas

- **Payload**:
  - solo los cinco campos del enunciado: el receptor no sabría si la identificación es una CC o un NIT;
  - el crédito completo: sale más información personal;
  - el monto como número, igual al ejemplo: pierde precisión en montos enormes y se aparta del contrato de la API.
- **Firma**:
  - con headers propios al estilo de Stripe (`t=…,v1=…`): la misma protección, pero con un formato que el receptor implementa a mano;
  - solo sobre el cuerpo, al estilo de GitHub: una petición capturada se puede repetir.
- **El requestId solo interno**: el sistema externo no tendría con qué reportar un caso.
- **Reintentos**:
  - 8 intentos a lo largo de unas 9 horas: aguanta una caída larga, pero en la demo nunca se ve llegar a `FALLIDO`;
  - 5 intentos en 75 s: con eso, una caída de 2 minutos ya deja eventos en `FALLIDO`.
- **Timeout de 5 s**: fue la primera recomendación, antes de contrastarla con la spec. Se cambió a 15 s, el mínimo que esta sugiere.
- **Qué reintentar**:
  - todo lo que no sea 2xx: gasta los intentos en errores que no cambian;
  - además, respetar `Retry-After`: suma lógica que la demo no necesita.
- **Error de la traza sin el inicio de la respuesta**: el motivo del rechazo habría que pedirlo al otro lado.
- **Reclamo**:
  - un estado `EN_PROCESO` con columnas `tomadoPor` y `tomadoHasta`: cambia el esquema y necesita un barrido de los eventos trabados;
  - un solo worker activo con `sp_getapplock`: no escala horizontalmente.
- **Lectura cada 5 s, o de a un evento**: la notificación tarda más, o un receptor lento retrasa la cola.
- **Una sola configuración para los dos procesos**: el worker no arrancaría sin `JWT_SECRET`, y cada proceso tendría los secretos del otro.
- **axios o undici directo**: dependencias para algo que `fetch` ya resuelve.
- **La traza solo por crédito, o sin endpoints**: no habría una vista de los `FALLIDO`, o el frontend no podría mostrarla.
- **Reenvío manual de los `FALLIDO`** (`POST /api/webhooks/eventos/{eventId}/reenviar`, un intento por reenvío). Se descartó por un caso que no resolvía: un evento que llega a `FALLIDO` por un 4xx en el segundo intento tiene `intentos` = 2. Tras reenviarlo, un fallo temporal seguiría reintentando hasta el sexto, en vez de volver a `FALLIDO`. Resolverlo exigía una columna nueva (`reenvios`).
- **https obligatorio salvo un permiso explícito** (`WEBHOOK_PERMITIR_HTTP`): se prefirió atarlo a `NODE_ENV`.
- **Abortar los envíos en curso al apagar**: el apagado es inmediato, pero el receptor puede recibir de nuevo un evento que ya había procesado.

## Consecuencias

- **Positivas**:
  - La creación nunca espera al sistema externo, y ningún evento se pierde por una caída de la API, del worker o del receptor.
  - El worker escala horizontalmente sin coordinación: la BD reparte los eventos.
  - La firma sigue un estándar público: el receptor puede verificarla con librerías existentes.
  - Cada intento queda en una tabla inmutable, con su resultado, su status, su duración y el motivo.
- **Costos aceptados**:
  - **Entrega al menos una vez**: si un worker muere a mitad del envío, el receptor recibe el evento dos veces. Tiene que deduplicar por `webhook-id`.
  - **Un `FALLIDO` es definitivo**: no hay reenvío desde la API. Queda en la traza, con el motivo de cada intento, para revisarlo.
  - **El worker espera el lote completo** antes de la siguiente lectura: un evento lento retrasa los demás de su lote hasta un timeout (15 s). Como todos van al mismo receptor, si uno está lento, normalmente lo están todos.
  - **Los valores de la demo son cortos para producción**: la spec sugiere reintentar durante días. En producción se suben `WEBHOOK_MAX_INTENTOS` y `WEBHOOK_BACKOFF_BASE_MS`.
  - **La notificación sale hasta 2 s después** de la creación, según el intervalo de lectura.

## Verificación (2026-10-01)

**51 pruebas de punta a punta**, todas con el resultado esperado. La API y el worker corren compilados (`dist/`), y un receptor temporal verifica la firma y responde según el escenario de cada asociado. El worker usa valores cortos (4 intentos, base de 400 ms, timeout de 1,5 s):

- **Contrato**:
  - firma válida y timestamp actual;
  - `webhook-id` igual al `eventId`;
  - exactamente los campos aprobados, con el monto como string y `timestamp` igual a `fechaSolicitud`;
  - `x-request-id` igual al de la creación;
  - el payload del detalle idéntico al cuerpo enviado.
- **Atomicidad**: una creación que falla con 409 o 422 no deja evento en el outbox.
- **Reintentos**:
  - 503, 503 y 200: `ENTREGADO` en el tercer intento;
  - 429 y 408 se reintentan;
  - 400 y 302: `FALLIDO` sin reintentos, sin seguir la redirección y con el motivo del receptor en la traza;
  - una respuesta de 5000 caracteres deja 500;
  - un receptor lento produce `TIMEOUT`, y una conexión cortada `ERROR_RED`; los dos se reintentan;
  - cuatro fallas temporales: `FALLIDO`, con esperas medidas de 477, 898 y 1560 ms (base 400 ms, ±20 %).
- **Receptor caído**: `ERROR_RED` con `ECONNREFUSED`. Cuando vuelve, el evento se entrega.
- **Dos workers a la vez**: 20 créditos, 20 eventos `ENTREGADO` en un solo intento, cada uno recibido una sola vez y repartidos entre los dos.
- **Un worker muerto a mitad del envío** (`SIGKILL`): otro lo retoma a los ~61 s, con el hueco del intento 1 en la traza, y el receptor lo recibe dos veces con el mismo `webhook-id`.
- **Traza en la API**:
  - ANALISTA y ASESOR reciben 403;
  - `eventId` inválido (400) e inexistente (404 `EVENTO_WEBHOOK_NOT_FOUND`);
  - filtros por estado y por crédito, y paginación;
  - lo más reciente primero, y la lista sin payload.
- **Logs**: llevan el requestId de la creación, nunca el cuerpo de un rechazo, y `FALLIDO` sale como `error` con su motivo.
- **Configuración**:
  - el worker no arranca sin URL ni secreto, con un secreto sin `whsec_` o de 16 bytes, con http en producción, ni con un timeout de 60 s;
  - arranca sin `JWT_SECRET` ni `CORS_ORIGINS`, y la API arranca sin ninguna `WEBHOOK_*`.
- **Swagger**: la sección `webhooks` con `credito.creado`, sus headers y el payload.

Desde el paso 5, estos escenarios están en la suite automatizada (`webhook.test.ts` y `configProcesos.test.ts`, [ADR 0019](0019-implementacion-de-las-pruebas.md)). Esa suite encontró que dos reclamos simultáneos no se repartían los eventos; se corrigió la consulta y este script volvió a pasar completo: 51 de 51.

**Pendiente de verificar:** el apagado ordenado. En Windows, `SIGTERM` termina el proceso sin pasar por el handler; se verifica en el contenedor Linux (paso 8).

## Por definir en la implementación

- En el compose (paso 8): `stop_grace_period: 25s` para el worker, y cómo se cumple https si la demo corre con `NODE_ENV=production`.

Resuelto en el [ADR 0020](0020-mock-del-sistema-externo.md): el mock escucha en `http://localhost:4000/webhooks/creditos`, verifica la firma con la librería oficial (ventana de 5 minutos), deduplica por `webhook-id` y tiene seis modos que se cambian en vivo.

Última actualización: 2026-10-01
