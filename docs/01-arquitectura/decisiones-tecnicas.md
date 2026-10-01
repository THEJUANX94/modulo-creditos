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

El idioma del código y las convenciones de nombrado están en [convenciones.md](../02-desarrollo/convenciones.md). Los parámetros visuales completos están en [design-system.md](../05-frontend/design-system.md).

## Pendiente de documentar

Se agregan a este resumen a medida que se decidan:

- Modelo de datos: tablas, llaves, índices, tipos, restricciones, fechas y estados.
- Reglas de negocio: control de duplicados, transiciones de estado permitidas y qué información es inmutable.
- Propuesta de despliegue productivo y respuesta de escalabilidad.

Última actualización: 2026-09-30
