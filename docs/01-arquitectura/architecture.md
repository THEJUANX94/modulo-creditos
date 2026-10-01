---
type: architecture
tags: [arquitectura, express, react, sql-server, webhook]
---

# Arquitectura

> **Documento parcial.** Describe los componentes y la estructura decididos en los ADR 0001 a 0011. Faltan el diagrama, el modelo de datos, la máquina de estados del crédito y la propuesta de despliegue.

## 1. Contexto

Una entidad del sector financiero solidario administra las solicitudes de crédito de sus asociados: las registra, las consulta, actualiza su información y cambia su estado, y guarda un historial de esos cambios. Cada crédito creado se notifica a un sistema externo por webhook.

## 2. Componentes

| Componente | Tecnología | Rol | Estado |
|---|---|---|---|
| Frontend | React + Vite, servido por Nginx | Panel administrativo: dashboard, listado, creación y detalle | Sin estado (archivos estáticos) |
| API | Express + TypeScript (`server.ts`) | API REST, autenticación, validación y reglas de negocio | Sin estado; todo se guarda en la BD |
| Worker | El mismo código de la API (`worker.ts`) | Envía los eventos del outbox al sistema externo, con reintentos | Sin estado; los eventos y su traza están en la BD |
| SQL Server | SQL Server | Créditos, historial, usuarios, outbox y traza del webhook | **Con estado** |
| Mock receptor | *Por definir* | Simula el sistema externo: verifica la firma, deduplica y puede fallar a voluntad | *Por definir* |

Decisiones relacionadas: [ADR 0001](decisions/0001-monorepo-pnpm-workspaces.md) (repositorio y docker-compose), [ADR 0002](decisions/0002-express-typescript-react-vite.md) (stack), [ADR 0006](decisions/0006-webhook-outbox-transaccional.md) (worker y mock).

## 3. Estructura del repositorio

Ver el árbol del [ADR 0001](decisions/0001-monorepo-pnpm-workspaces.md). La estructura interna de la API está en el [ADR 0004](decisions/0004-api-modular-por-capas.md).

## 4. Flujo de creación de un crédito

1. El frontend envía `POST /api/creditos` con el access token.
2. La API valida la entrada con el esquema Zod compartido ([ADR 0007](decisions/0007-zod-compartido-openapi-generado.md)) y el service aplica las reglas de negocio ([ADR 0004](decisions/0004-api-modular-por-capas.md)).
3. En una sola transacción se guardan el crédito y el evento `credito.creado` en estado `PENDIENTE`.
4. La API responde `201` sin esperar al sistema externo.
5. El worker toma el evento, lo firma, lo envía y registra el intento. Si el envío falla, lo reprograma con backoff ([ADR 0006](decisions/0006-webhook-outbox-transaccional.md)).

Toda la operación comparte un mismo **requestId**: aparece en los logs de la API, se guarda con el evento del outbox y vuelve a aparecer en los logs del worker que lo entrega.

## 5. Trazabilidad

| Capa | Dónde vive | Qué registra |
|---|---|---|
| Logs técnicos | stdout en JSON (pino); en producción, un sistema central | Peticiones, errores y tiempos, correlacionados por requestId y sin datos personales completos |
| Auditoría de negocio | Tablas de la BD que solo admiten inserciones | Cambios de estado, cambios de datos del crédito y eventos de seguridad |
| Traza del webhook | Tablas del outbox y de los intentos en la BD | Cada evento, cada intento de envío y su resultado |

Decisión completa en el [ADR 0010](decisions/0010-logs-tecnicos-y-auditoria.md).

## Pendiente

- Diagrama de arquitectura en [diagrams/](diagrams/).
- Modelo de datos.
- Máquina de estados del crédito.
- Propuesta de despliegue productivo y respuesta de escalabilidad.

Última actualización: 2026-09-30
