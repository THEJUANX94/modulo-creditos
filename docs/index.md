---
type: index
tags: [modulo-creditos, prueba-tecnica, financiero-solidario]
okf_version: "0.1"
---

# Índice de documentación — Módulo de Créditos

Documentación técnica del **Módulo de Créditos**: registro, consulta, actualización y cambio de estado de las solicitudes de crédito de los asociados de una entidad del sector financiero solidario, con notificación a un sistema externo por webhook. Se desarrolla como prueba técnica para **OPA SAS** (Desarrollador Semi Senior).

Esta carpeta es la fuente de verdad técnica del repositorio: aquí está el porqué de cada decisión. La instalación y la ejecución las cubrirá el README de la raíz.

> **Estado: API en construcción (paso 4).** El esquema de SQL Server está verificado y la API tiene su base (config, logs, errores, health) y la autenticación con gestión de usuarios. Faltan los créditos y el webhook. Los documentos marcados como *pendiente* o *parcial* se completan a medida que se construye cada parte.

## Estructura

- [01-arquitectura/decisiones-tecnicas.md](01-arquitectura/decisiones-tecnicas.md) — **Resumen de las decisiones técnicas**: una línea por decisión, con enlace a su ADR. Es el punto de entrada para quien evalúa.
- [01-arquitectura/architecture.md](01-arquitectura/architecture.md) — Componentes del sistema, estructura del repositorio y flujo de creación de un crédito. *Parcial*: falta el diagrama de arquitectura.
- [01-arquitectura/modelo-datos.md](01-arquitectura/modelo-datos.md) — **Diccionario de datos**: diagrama entidad-relación, cada tabla con sus columnas, tipos, llaves, índices y restricciones justificados, la seguridad en la BD y la verificación contra SQL Server.
- [01-arquitectura/decisions/](01-arquitectura/decisions/) — ADRs: cada decisión con su contexto, las alternativas consideradas, sus consecuencias y lo que queda por definir. Van del [ADR 0001](01-arquitectura/decisions/0001-monorepo-pnpm-workspaces.md) al [ADR 0016](01-arquitectura/decisions/0016-autenticacion-sesiones-y-permisos.md); el último es la autenticación, la sesión única y los permisos.
- [01-arquitectura/diagrams/](01-arquitectura/diagrams/) — Diagramas: el entidad-relación (`modelo-datos.png`, con su fuente DBML). *Pendiente*: el de arquitectura.
- [02-desarrollo/convenciones.md](02-desarrollo/convenciones.md) — Idioma del código, nombrado (camelCase y sus excepciones) y diseño de rutas.
- [02-desarrollo/setup-local.md](02-desarrollo/setup-local.md) — Requisitos, primer arranque (compose, dependencias, API), cambios de esquema y verificación de código. *Parcial*: faltan el worker, la web y el mock.
- [02-desarrollo/variables-entorno.md](02-desarrollo/variables-entorno.md) — Variables del compose y de la API: obligatoriedad, valor por defecto y cuáles son secretos. *Parcial*: faltan las del worker, el mock y la web.
- [03-operacion/deploy.md](03-operacion/deploy.md) — Propuesta de despliegue productivo: HTTPS, secretos, backup de SQL Server, logs, health checks, monitoreo y CI/CD. *Pendiente*.
- [03-operacion/troubleshooting.md](03-operacion/troubleshooting.md) — Problemas conocidos y su solución: pnpm 12 en Windows, `QUOTED_IDENTIFIER` y UTF-8 con sqlcmd, rutas de Git Bash con `docker exec`, rate limit en desarrollo, sesión única y limitaciones de Prisma.
- [05-frontend/design-system.md](05-frontend/design-system.md) — Parámetros visuales del frontend: estilo, paletas clara y oscura con su contraste medido, tipografía, radios, espaciado, foco, iconos y reglas de UX obligatorias.
- [log.md](log.md) — Bitácora de cambios.

Última actualización: 2026-10-01
