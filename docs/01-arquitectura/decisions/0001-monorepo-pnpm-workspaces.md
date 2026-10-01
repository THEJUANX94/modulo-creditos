---
type: decision
tags: [adr, monorepo, pnpm, docker]
---

# ADR 0001: Monorepo con pnpm workspaces y docker-compose para todo el sistema

## Estado

Aceptado (2026-09-30).

## Contexto

La solución tiene al menos tres piezas que comparten un mismo contrato: la API, el frontend y la definición del crédito (campos, estados, catálogos y validaciones). Si cada pieza define ese contrato por su cuenta, las definiciones terminan desincronizándose.

El gestor de paquetes es **pnpm**. La prueba recomienda además un `docker-compose.yml` que levante frontend, backend y SQL Server; no es obligatorio, pero cuenta como diferenciador.

## Decisión

1. **Un solo repositorio con pnpm workspaces**:

   ```
   /
   ├─ apps/
   │  ├─ api/       @creditos/api     Express + TypeScript (API y worker)
   │  └─ web/       @creditos/web     React + Vite
   ├─ packages/
   │  └─ shared/    @creditos/shared  esquemas Zod, tipos y catálogos
   ├─ database/     scripts SQL
   ├─ docs/         documentación (OKF)
   ├─ docker-compose.yml
   └─ pnpm-workspace.yaml
   ```

2. **Sin Turborepo.** Con dos apps y un paquete compartido alcanzan los comandos recursivos de pnpm (`pnpm -r`, `--filter`).
3. **`docker-compose.yml` en la raíz levanta el sistema completo**: SQL Server, la inicialización de la BD (script y datos semilla), la API, el worker, el frontend (servido por Nginx) y el mock receptor del webhook. Un `docker compose up` deja todo funcionando.
4. **Para desarrollar**, cada app corre con pnpm y Docker solo aporta la infraestructura.

## Alternativas consideradas

- **Dos carpetas independientes** (`backend/`, `frontend/`), sin workspaces. Es más simple de montar, pero duplica los tipos y las validaciones en ambos lados.
- **Monorepo con Turborepo**, como en proyectos más grandes. La caché y la orquestación de tareas no aportan con este tamaño, y suma una capa de herramientas y de configuración.
- **docker-compose solo con la infraestructura** (SQL Server y el mock). Es menos trabajo, pero quien evalúa tendría que instalar Node y pnpm para ver el sistema funcionando.

## Consecuencias

- **Positivas**:
  - Un cambio en el contrato del crédito se hace una vez, y si la API o el frontend quedan desalineados, falla la compilación.
  - Quien evalúa levanta el sistema completo con un solo comando, sin preparar nada en su máquina aparte de Docker.
- **Costos aceptados**:
  - `@creditos/shared` se consume desde Node (API) y desde el navegador (web), así que su configuración de TypeScript y de build tiene que servir para ambos.
  - El compose tiene seis servicios que mantener.
  - npm no admite mayúsculas en los nombres de paquete, así que los paquetes son una excepción a camelCase (ver [convenciones](../../02-desarrollo/convenciones.md)).

## Por definir en la implementación

Resuelto en el [ADR 0013](0013-modelo-de-datos.md) y el [ADR 0015](0015-contrato-http-y-base-de-la-api.md): SQL Server 2022, y el compose de infraestructura (`sqlserver` + `dbInit`) existe desde el paso 4. El paso 8 lo completa con el resto de servicios.

Resuelto en el [ADR 0012](0012-toolchain-del-monorepo.md): `shared` se consume desde sus fuentes TypeScript, el mock vive en `apps/webhookMock` (paquete `@creditos/webhook-mock`), Node 24 y pnpm 12.8.1.

Última actualización: 2026-09-30
