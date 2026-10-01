---
type: decision
tags: [adr, logs, auditoria, trazabilidad, pino, datos-personales]
---

# ADR 0010: Logs técnicos con pino y auditoría de negocio en la BD

## Estado

Aceptado (2026-09-30).

## Contexto

El sistema maneja información financiera y datos personales de los asociados. El enunciado lo pide en dos lugares:

- **Sección 11, auditoría y trazabilidad**: se valora un historial de cambios (crédito, estado anterior, estado nuevo, usuario, fecha y observación) y hay que explicar qué información es modificable y cuál inmutable.
- **Sección 16, despliegue**: la propuesta productiva debe considerar logs y monitoreo.

Esto se suele resolver como si fuera una sola cosa ("los logs"), pero son tres necesidades distintas, con lectores, retención y garantías diferentes:

| Capa | Pregunta que responde | Quién la lee |
|---|---|---|
| Logs técnicos | ¿Qué pasó en el sistema? Qué petición llegó, cuánto tardó, qué error dio | Desarrollo y operación |
| Auditoría de negocio | ¿Quién cambió qué, cuándo y por qué? | Negocio, control interno, entes de control |
| Traza del webhook | ¿Qué se notificó al sistema externo y con qué resultado? | Operación e integración ([ADR 0006](0006-webhook-outbox-transaccional.md)) |

Los datos de identificación de los asociados son datos personales, protegidos en Colombia por la Ley 1581 de 2012 (habeas data).

## Decisión

### 1. Logs técnicos: pino, JSON y stdout

- La API y el worker generan los logs con **pino**, y **pino-http** registra cada petición (método, ruta, status y duración).
- El formato es **JSON estructurado con niveles**. En desarrollo se lee con `pino-pretty`.
- Los logs salen por **stdout**: la aplicación no escribe archivos. Docker los captura (`docker compose logs`) y en producción un agente los envía a un sistema central. Esa pieza se describe en la propuesta de [despliegue](../../03-operacion/deploy.md).

### 2. Correlación de punta a punta con requestId

- Cada petición lleva un **requestId**: si llega el header `X-Request-Id` se respeta, y si no, se genera.
- Ese requestId aparece en **todas las líneas de log** de la petición (se propaga con `AsyncLocalStorage`), se devuelve en el header `X-Request-Id` y se incluye en las respuestas de error.
- Además **se guarda en el evento del outbox**. Así, los logs del worker que entrega el webhook quedan ligados a la petición que creó el crédito.

### 3. Datos sensibles fuera de los logs técnicos

- **Contraseñas, tokens y cookies se eliminan siempre**, con la redacción de pino.
- **La identificación del asociado se enmascara** (por ejemplo, `******4567`) y **el nombre no se registra**.
- La auditoría en la BD sí guarda los datos completos, con acceso controlado. Los logs técnicos no se convierten en una copia paralela de datos personales.

### 4. Auditoría de negocio en la BD, inmutable

Se registra en tablas de la BD que solo admiten inserciones:

- **Cambios de estado** (`HistorialCredito`): crédito, estado anterior, estado nuevo, usuario, fecha y observación.
- **Cambios de datos del crédito**: cada actualización y el borrado lógico guardan qué campos cambiaron, con su valor anterior y nuevo, el usuario y la fecha.
- **Eventos de seguridad**: login exitoso y fallido, refresh, logout y accesos denegados (401/403), con el usuario, la IP y la fecha.

## Alternativas consideradas

- **winston.** Es flexible, con muchos transports, pero más lento y con más configuración para lograr JSON estructurado.
- **morgan + console.** Es simple, pero no es estructurado, no tiene niveles reales ni redacción de campos.
- **requestId solo en el access log, o sin correlación.** Seguir una operación obligaría a cruzar líneas por hora y ruta, y el webhook quedaría desconectado de la petición que lo originó.
- **Loki y Grafana en el docker-compose.** Permitiría buscar logs en vivo durante la socialización, pero suma dos contenedores y su configuración. Queda como pieza de la propuesta productiva.
- **Archivos con rotación.** Atan los logs al disco del contenedor y complican escalar y centralizar.
- **Auditar también las consultas a créditos** (quién vio qué crédito). Es común con datos personales, pero genera mucho volumen para el alcance de la prueba.
- **Quitar solo los secretos** y dejar completos la identificación y el nombre. Facilita depurar, pero expone datos personales en el sistema de logs.

## Consecuencias

- **Positivas**:
  - Un error que ve el usuario en el frontend se rastrea con un solo requestId a través de la API, la BD y la entrega del webhook.
  - La auditoría responde quién, qué, cuándo y desde dónde, sin depender de los logs técnicos, que se pueden rotar o perder.
  - Los logs técnicos se pueden centralizar o compartir con menos riesgo, porque no llevan datos personales completos.
- **Costos aceptados**:
  - El JSON es incómodo de leer a mano: en local hace falta `pino-pretty`, o `jq` sobre `docker compose logs`.
  - Al enmascarar la identificación, para depurar el caso de un asociado hay que partir del requestId o del id del crédito.
  - Las tablas de auditoría crecen con cada cambio: necesitan índices y una política de retención, lo que se trata en la respuesta de escalabilidad.

## Por definir en la implementación

- Los niveles de log por entorno y qué se registra en cada nivel.
- El formato del requestId y su ubicación exacta en el cuerpo de las respuestas de error.
- Si el requestId también viaja al receptor del webhook (en un header).
- La estructura de las tablas de auditoría: una genérica o una por tipo. Se define con el modelo de datos.
- Si la auditoría se escribe en la misma transacción que el cambio que registra.
- Cómo se garantiza que la auditoría sea inmutable (permisos de la BD, triggers).
- La retención de los logs técnicos y de la auditoría.
- Qué partes de la auditoría expone la API y muestra el frontend (por ejemplo, el historial en el detalle del crédito).

Última actualización: 2026-09-30
