---
type: index
tags: [modulo-creditos, prueba-tecnica, financiero-solidario]
okf_version: "0.1"
---

# Índice de documentación — Módulo de Créditos

Documentación técnica del **Módulo de Créditos**: registro, consulta, actualización y cambio de estado de las solicitudes de crédito de los asociados de una entidad del sector financiero solidario, con notificación a un sistema externo por webhook. Se desarrolla como prueba técnica para **OPA SAS** (Desarrollador Semi Senior).

Esta carpeta es la fuente de verdad técnica del repositorio: aquí está el porqué de cada decisión. La instalación y la ejecución las cubrirá el README de la raíz.

> **Estado: scaffold.** Las decisiones de arquitectura están documentadas y el monorepo está montado: los paquetes existen y compilan, pero todavía no tienen funcionalidad. Los documentos marcados como *pendiente* o *parcial* se completan a medida que se construye cada parte.

## Estructura

- [01-arquitectura/decisiones-tecnicas.md](01-arquitectura/decisiones-tecnicas.md) — **Resumen de las decisiones técnicas**: una línea por decisión, con enlace a su ADR. Es el punto de entrada para quien evalúa.
- [01-arquitectura/architecture.md](01-arquitectura/architecture.md) — Componentes del sistema, estructura del repositorio y flujo de creación de un crédito. *Parcial*: faltan el diagrama, el modelo de datos y la máquina de estados.
- [01-arquitectura/decisions/](01-arquitectura/decisions/) — ADRs: cada decisión con su contexto, las alternativas consideradas, sus consecuencias y lo que queda por definir. Van del [ADR 0001](01-arquitectura/decisions/0001-monorepo-pnpm-workspaces.md) al [ADR 0012](01-arquitectura/decisions/0012-toolchain-del-monorepo.md); el último es el toolchain del monorepo.
- [01-arquitectura/diagrams/](01-arquitectura/diagrams/) — Diagramas de arquitectura. *Pendiente*.
- [02-desarrollo/convenciones.md](02-desarrollo/convenciones.md) — Idioma del código, nombrado (camelCase y sus excepciones) y diseño de rutas.
- [02-desarrollo/setup-local.md](02-desarrollo/setup-local.md) — Requisitos, instalación y comandos de verificación del workspace. *Parcial*: faltan la BD, Docker y el arranque de las apps.
- [02-desarrollo/variables-entorno.md](02-desarrollo/variables-entorno.md) — Variables de entorno de cada aplicación. *Pendiente*.
- [03-operacion/deploy.md](03-operacion/deploy.md) — Propuesta de despliegue productivo: HTTPS, secretos, backup de SQL Server, logs, health checks, monitoreo y CI/CD. *Pendiente*.
- [03-operacion/troubleshooting.md](03-operacion/troubleshooting.md) — Problemas conocidos y su solución: por ahora, pnpm 12 en Windows.
- [05-frontend/design-system.md](05-frontend/design-system.md) — Parámetros visuales del frontend: estilo, paletas clara y oscura con su contraste medido, tipografía, radios, espaciado, foco, iconos y reglas de UX obligatorias.
- [log.md](log.md) — Bitácora de cambios.

Última actualización: 2026-09-30
