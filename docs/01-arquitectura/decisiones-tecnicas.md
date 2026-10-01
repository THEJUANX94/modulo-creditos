---
type: reference
tags: [decisiones, adr, resumen]
---

# Decisiones técnicas — resumen

Las decisiones que dan forma al Módulo de Créditos, en una línea cada una. Cada fila enlaza al ADR con el contexto, las alternativas descartadas, las consecuencias y lo que queda por definir.

| # | Decisión | Por qué | ADR |
|---|---|---|---|
| 1 | Monorepo con pnpm workspaces: `apps/api`, `apps/web` y `packages/shared`. Un `docker-compose.yml` levanta todo el sistema | Los tipos y las validaciones se definen una sola vez para el backend y el frontend, y quien evalúa levanta todo con un comando | [0001](decisions/0001-monorepo-pnpm-workspaces.md) |
| 2 | Node.js + TypeScript + Express en la API; React + Vite + Tailwind + shadcn/ui en el frontend | Es el stack que recomienda la prueba, y una SPA alcanza para un panel administrativo sin SEO | [0002](decisions/0002-express-typescript-react-vite.md) |
| 3 | SQL Server, con el script SQL escrito a mano como fuente de verdad. Prisma genera el cliente por introspección (`db pull`) | El modelo (llaves, índices, `CHECK`, `DECIMAL(18,2)`) queda escrito y defendible, y aun así hay un cliente tipado | [0003](decisions/0003-sql-primero-prisma-por-introspeccion.md) |
| 4 | API modular por capas (routes → controller → service → repository por dominio). Las reglas de negocio viven en el service | Las reglas quedan en un solo lugar, sin depender de HTTP ni de la BD, y son fáciles de probar y de explicar | [0004](decisions/0004-api-modular-por-capas.md) |
| 5 | Access token JWT de vida corta + refresh token rotativo en una cookie httpOnly, con usuarios y roles | Protege la API, deja un usuario real en el historial y no expone el refresh token a JavaScript | [0005](decisions/0005-jwt-acceso-refresh-cookie-httponly.md) |
| 6 | Webhook con outbox transaccional y un worker en proceso aparte, con firma HMAC, reintentos con backoff y traza de cada intento. Un mock receptor configurable simula el sistema externo | El evento se guarda en la misma transacción que el crédito: no se pierde si el sistema externo falla y no hay un segundo INSERT del crédito | [0006](decisions/0006-webhook-outbox-transaccional.md) |
| 7 | Esquemas Zod en `packages/shared`, con el Swagger/OpenAPI generado a partir de ellos | Cada contrato tiene una sola definición, que comparten la API, los formularios y la documentación | [0007](decisions/0007-zod-compartido-openapi-generado.md) |
| 8 | Vitest + Supertest contra un SQL Server real en Docker | Ejercita de verdad las restricciones, las transacciones y el outbox, no un mock | [0008](decisions/0008-pruebas-vitest-supertest-bd-real.md) |
| 9 | Una sola entidad; multi-entidad queda como propuesta documentada | La prueba no exige implementarla, y la ruta queda escrita para la pregunta de escalabilidad | [0009](decisions/0009-una-entidad-multi-entidad-como-propuesta.md) |
| 10 | Logs técnicos con pino (JSON a stdout), correlacionados por requestId hasta el webhook y sin datos personales completos. Auditoría inmutable en la BD de cambios de estado, cambios de datos y eventos de seguridad | Diagnóstico (logs) y rendición de cuentas (auditoría) son necesidades distintas, con garantías distintas | [0010](decisions/0010-logs-tecnicos-y-auditoria.md) |
| 11 | Diseño visual guiado por la skill ui-ux-pro-max: estilo Minimalism & Swiss + Accessible, paleta de banca en modo claro y oscuro, IBM Plex Sans | Cada valor visual tiene una fuente rastreable y el contraste está medido antes de escribir código | [0011](decisions/0011-diseno-visual-ui-ux-pro-max.md) |
| 12 | Toolchain: Node 24 LTS, pnpm 12 con catalogs, TypeScript 6.0 estricto, Express 5, ESM, tsx + tsup, ESLint con reglas con tipos y convención de nombres, Prettier | TypeScript 6.0 es la última versión compatible con el lint con tipos, y `shared` desde las fuentes evita un paso de build | [0012](decisions/0012-toolchain-del-monorepo.md) |
| 13 | Modelo de datos: Asociados aparte con tipo de identificación, catálogos como tablas, UUID público + consecutivo clustered, `numeroCredito` calculado, `DECIMAL(18,2)`, fechas UTC, historial en dos tablas inmutables y login de la app con mínimo privilegio | La BD garantiza las reglas estructurales aunque falle el código, y los ids públicos no se pueden enumerar sin pagar con fragmentación | [0013](decisions/0013-modelo-de-datos.md) |
| 14 | Reglas de negocio: flujo estricto con rechazo directo, un crédito en curso por asociado y tipo, edición y borrado solo en SOLICITADO, motivo al rechazar, cancelar o borrar, y concurrencia optimista con `ROWVERSION` | Cada regla vive en el service y, si se puede expresar como restricción, también en la BD | [0014](decisions/0014-reglas-de-negocio.md) |
| 15 | Contrato HTTP: sobre `{ success, data, meta }` simétrico al error, errores con `details` y `requestId`, códigos 400/409/422 según el tipo, montos como string. Base: config validada con Zod, health de liveness y readiness, seguridad HTTP, compose de infraestructura | El frontend trata todas las respuestas igual, y cada error se rastrea con su requestId | [0015](decisions/0015-contrato-http-y-base-de-la-api.md) |
| 16 | Autenticación: Argon2id, JWT HS256 de 15 min, refresh opaco y rotativo con detección de reuso, **una sola sesión por usuario** verificada en cada petición, rate limit sin bloqueo de cuentas, matriz de permisos con cuatro ojos, y eventos de seguridad inmutables | Una sesión robada o duplicada se corta al instante, y cada acción sobre sesiones y usuarios queda auditada | [0016](decisions/0016-autenticacion-sesiones-y-permisos.md) |
| 17 | API de créditos: PATCH parcial, historial como línea de tiempo, resumen con cantidades y montos, catálogos en una llamada, filtros con fechas en hora de Colombia, búsqueda sin tildes, orden en una lista cerrada, eliminados solo para ADMIN, y Swagger 3.1 generado desde los mismos esquemas Zod | Cada regla del ADR 0014 tiene su prueba, y el evaluador puede probarlo todo desde Swagger con el contrato real | [0017](decisions/0017-api-de-creditos-y-swagger.md) |
| 18 | Webhook: evento con los campos del enunciado más los tipos y el monto como string, firma Standard Webhooks (HMAC-SHA256), 6 intentos con backoff exponencial y jitter, timeout de 15 s, solo se reintentan las fallas temporales, reclamo atómico con `READPAST` y lease, config separada por proceso y traza de solo lectura para ADMIN | Ningún evento se pierde ni se envía dos veces en operación normal, el receptor verifica el origen con un estándar público, y cada intento queda con su motivo | [0018](decisions/0018-webhook-entrega-firma-y-traza.md) |
| 19 | Pruebas: BD aparte recreada en cada corrida con los mismos scripts, archivos en serie con datos únicos, las verificaciones de 4b a 4d convertidas en 207 pruebas que validan también el contrato de Swagger, y cobertura como reporte sin umbral | Cada regla corre con un comando contra la BD real, sin tocar los datos de desarrollo; la suite ya encontró un defecto de concurrencia en el reclamo del webhook | [0019](decisions/0019-implementacion-de-las-pruebas.md) |
| 20 | Mock del sistema externo con `node:http`: verifica la firma con la librería oficial de Standard Webhooks, valida el contrato, deduplica con 200 y tiene seis modos de falla que se cambian en vivo desde una página | Cada respuesta posible del sistema externo se muestra en la demo, y queda probado que un receptor cualquiera verifica nuestras firmas | [0020](decisions/0020-mock-del-sistema-externo.md) |
| 21 | Frontend: mismo origen que la API, React Router con los filtros en la URL, TanStack Query, formularios con los esquemas de `shared`, sesión recuperada con el refresh, solo las acciones válidas por estado y rol, barra superior, y el design system aplicado con sus pendientes resueltos | El frontend no repite ninguna regla, cada error dice la causa y su código de soporte, y la interfaz cumple el contraste y el área táctil medidos | [0021](decisions/0021-frontend.md) |

El idioma del código y las convenciones de nombrado están en [convenciones.md](../02-desarrollo/convenciones.md). Los parámetros visuales completos están en [design-system.md](../05-frontend/design-system.md). El diccionario de datos está en [modelo-datos.md](modelo-datos.md).

## Pendiente de documentar

Se agrega a este resumen cuando se decida:

- Propuesta de despliegue productivo y respuesta de escalabilidad.

Última actualización: 2026-10-01
