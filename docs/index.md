---
type: index
tags: [modulo-creditos, prueba-tecnica, financiero-solidario]
okf_version: "0.1"
---

# Índice de documentación — Módulo de Créditos

Documentación técnica del **Módulo de Créditos**: registro, consulta, actualización y cambio de estado de las solicitudes de crédito de los asociados de una entidad del sector financiero solidario, con notificación a un sistema externo por webhook. Se desarrolla como prueba técnica para **OPA SAS** (Desarrollador Semi Senior).

Esta carpeta es la fuente de verdad técnica del repositorio: aquí está el porqué de cada decisión. Para instalar y ejecutar, el punto de entrada es el [README](../README.md) de la raíz.

> **Estado: completo (paso 9).** La API (autenticación, créditos, Swagger y webhook con su worker), el mock del sistema externo y la web funcionan juntos, y `docker compose up` los levanta con Nginx como única entrada; `pnpm test` corre 233 pruebas. La propuesta de despliegue productivo (`deploy.md`) es una propuesta: no se ejecutó, y dice qué brechas tiene el código para llegar a producción.

## Estructura

- [01-arquitectura/decisiones-tecnicas.md](01-arquitectura/decisiones-tecnicas.md) — **Resumen de las decisiones técnicas**: una línea por decisión, con enlace a su ADR. Es el punto de entrada para quien evalúa.
- [01-arquitectura/architecture.md](01-arquitectura/architecture.md) — Componentes del sistema, estructura del repositorio y flujo de creación de un crédito. *Parcial*: falta el diagrama de arquitectura.
- [01-arquitectura/modelo-datos.md](01-arquitectura/modelo-datos.md) — **Diccionario de datos**: diagrama entidad-relación, cada tabla con sus columnas, tipos, llaves, índices y restricciones justificados, la seguridad en la BD y la verificación contra SQL Server.
- [01-arquitectura/decisions/](01-arquitectura/decisions/) — ADRs: cada decisión con su contexto, las alternativas consideradas, sus consecuencias y lo que queda por definir. Van del [ADR 0001](01-arquitectura/decisions/0001-monorepo-pnpm-workspaces.md) al [ADR 0023](01-arquitectura/decisions/0023-entregables-finales-readme-diagrama-y-despliegue.md); el último es el de los entregables finales.
- [01-arquitectura/diagrams/](01-arquitectura/diagrams/) — Diagramas: el entidad-relación (`modelo-datos.png`, con su fuente DBML). Los de arquitectura (componentes, creación de un crédito y producción) son bloques Mermaid en [architecture.md](01-arquitectura/architecture.md) y [deploy.md](03-operacion/deploy.md).
- [02-desarrollo/convenciones.md](02-desarrollo/convenciones.md) — Idioma del código, nombrado (camelCase y sus excepciones) y diseño de rutas.
- [02-desarrollo/setup-local.md](02-desarrollo/setup-local.md) — El sistema completo con Docker en dos comandos; y para desarrollar con pnpm, requisitos, primer arranque (dependencias, API, mock, worker y web), pruebas automatizadas, cambios de esquema y verificación de código.
- [02-desarrollo/variables-entorno.md](02-desarrollo/variables-entorno.md) — Variables del compose (y el generador `pnpm env:generar`), de la API, del worker, del mock y de las pruebas: obligatoriedad, valor por defecto y cuáles son secretos. La web no tiene variables.
- [03-operacion/deploy.md](03-operacion/deploy.md) — Propuesta de despliegue productivo (Azure como referencia): arquitectura, qué es stateless y qué conserva estado, HTTPS, secretos y su rotación, backup y recuperación (RPO 5 min, RTO 1 h), logs, health checks, monitoreo con OpenTelemetry y Grafana, alertas, CI/CD con un workflow de GitHub Actions de referencia, y las brechas conocidas.
- [03-operacion/troubleshooting.md](03-operacion/troubleshooting.md) — Problemas conocidos y su solución: pnpm 12 en Windows, `QUOTED_IDENTIFIER`, `NOMBRE_BD` y UTF-8 con sqlcmd, rutas de Git Bash con `docker exec`, rate limit en desarrollo, sesión única, BD no disponible, comodines en la búsqueda, el secreto y los `FALLIDO` del webhook, el 401 del mock, eventos duplicados, las pruebas (Docker y puertos), el compose (variables faltantes, puertos ocupados, usuarios demo y 502), el 401 inicial de la web, Vite con archivos viejos y limitaciones de Prisma.
- [05-frontend/design-system.md](05-frontend/design-system.md) — Parámetros visuales del frontend: estilo, paletas clara y oscura con su contraste medido, tipografía, radios, espaciado, foco, iconos, reglas de UX obligatorias y lo decidido al implementarlo (badges de estado, variables de shadcn, escala, gráficos y breakpoints).
- [log.md](log.md) — Bitácora de cambios.

Última actualización: 2026-10-01
