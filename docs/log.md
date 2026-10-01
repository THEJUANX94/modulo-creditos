---
type: log
tags: [modulo-creditos, changelog]
---

# Bitácora de cambios — Módulo de Créditos

## [0.1.0] - 2026-09-30 — Paso 4a: base de la API

La API arranca, se conecta a la BD y responde con el contrato definido, pero todavía sin módulos de negocio. Decisiones en el [ADR 0015](01-arquitectura/decisions/0015-contrato-http-y-base-de-la-api.md).

### Added
- `docker-compose.yml` de infraestructura: `sqlserver` (SQL Server 2022, con volumen) y `dbInit`, que corre `database/inicializar.sh`. El script ejecuta 001 → 003 solo si la BD no existe, y se detiene si la encuentra a medias. `.env.example` en la raíz.
- `@creditos/shared`: catálogo de códigos de error con su status (`codigosError.ts`) y tipos del sobre de respuesta (`respuestas.ts`).
- `apps/api`:
  - Configuración validada con Zod (`config.ts`).
  - Logger pino con el requestId por `AsyncLocalStorage` y la identificación enmascarada en la URL.
  - Middlewares `requestId`, `httpLogger`, `notFound` y `errorHandler`, `AppError` y `responderExito`.
  - Cliente de Prisma con `@prisma/adapter-mssql`.
  - Módulo `health` (liveness y readiness), `app.ts` con helmet, CORS y el límite de JSON, y `server.ts` con apagado ordenado.
- Prisma 7.10.0 en `apps/api`: `prisma.config.ts`, `prisma/schema.prisma` introspectado y el cliente en `src/generated/prisma` (que git ignora), generado en el postinstall.
- Scripts `prisma:pull` y `prisma:generate`. `dev` carga el `.env` y pasa los logs por pino-pretty.
- `variables-entorno.md` (compose y API) y el primer arranque en `setup-local.md`.

### Changed
- `pnpm-workspace.yaml`: `zod` en el catalog; `prisma` y `@prisma/engines` en `allowBuilds`.
- `eslint.config.js`: ignora `**/generated/` y permite handlers async en las rutas (`no-misused-promises`), porque Express 5 maneja sus promesas.
- `.gitignore`: el cliente generado de Prisma.
- ADR 0001, 0003, 0007 y 0010: sus pendientes de compose, Prisma, códigos de validación, requestId y logs pasan a resueltos en el ADR 0015.
- `convenciones.md`: estilo de los módulos de la API.

### Verificado
- Compose: `dbInit` crea la BD en el primer arranque y no hace nada en el segundo.
- `prisma db pull` + `generate`; typecheck y lint, incluido el cliente generado bajo el `tsconfig` estricto.
- Con el bundle de producción: liveness, readiness con la BD arriba, detenida (503 en 27 ms) y levantada de nuevo (se recupera sin reiniciar), 404/400/413 en el formato estándar, `X-Request-Id`, helmet, CORS, logs con requestId y enmascarado, y la falla de una configuración inválida. Pendiente: el apagado ordenado, que se verifica en el paso 8 (en Windows no hay señales entre procesos).

## [0.1.0] - 2026-09-30 — Modelo de datos

El esquema de SQL Server está escrito y verificado. Decisiones en el [ADR 0013](01-arquitectura/decisions/0013-modelo-de-datos.md) (modelo) y el [ADR 0014](01-arquitectura/decisions/0014-reglas-de-negocio.md) (reglas de negocio).

### Added
- `database/001-crearBaseDatos.sql`: la BD `ModuloCreditos` (collation `Modern_Spanish_CI_AI`) y el login `appCreditos`, con su contraseña por variable de sqlcmd.
- `database/002-esquema.sql`: 11 tablas, con sus llaves, `CHECK`, índices (incluidos los filtrados), triggers de inmutabilidad y permisos de mínimo privilegio, todo en una sola transacción.
- `database/003-catalogos.sql`: tipos de identificación, tipos de crédito, formas de pago y roles.
- `01-arquitectura/modelo-datos.md`: diccionario de datos con la justificación de cada columna, llave, índice y restricción.
- `01-arquitectura/diagrams/modelo-datos.png` y `modelo-datos.dbml`: diagrama entidad-relación y su fuente.
- Secciones nuevas en `troubleshooting.md` (`QUOTED_IDENTIFIER`, UTF-8 con sqlcmd, rutas de Git Bash, limitaciones de Prisma) y en `setup-local.md` (creación manual de la BD).

### Changed
- ADR 0003: la BD no se limita por las capacidades de Prisma, y lo que Prisma no soporte va con SQL directo. Prisma 7.10.0 (Prisma 8 no soporta SQL Server). Tabla de lo que hace Prisma con el esquema real.
- ADR 0004, 0006 y 0010: sus pendientes de modelo, reglas, outbox y auditoría pasan a resueltos en los ADR 0013 y 0014.
- `convenciones.md`: nombres de restricciones (`PK_`, `UX_`, `CK_`…) y de scripts SQL.

### Removed
- `01-arquitectura/diagrams/.gitkeep`, porque la carpeta ya tiene contenido.

### Verificado
Contra SQL Server 2022 CU27, en un contenedor temporal:
- Los tres scripts corren sobre una BD vacía, y un fallo en el 002 no deja tablas a medias.
- 35 casos ejecutados como `appCreditos`, todos con el resultado esperado: `CHECK`, FK, duplicados con el índice filtrado, formato de la identificación por tipo, año de `numeroCredito` en hora de Colombia, búsqueda sin tildes, observaciones y motivos obligatorios, `ROWVERSION`, y permisos (sin `UPDATE`/`DELETE` en la auditoría ni `DELETE` en los créditos).
- `DENY UPDATE` por columna sobre `asociadoId` y `fechaSolicitud`. Los triggers bloquean incluso a `sa`.
- Prisma 7.10.0: `db pull` + `generate`, lecturas tipadas, `create` en tablas con triggers, y la creación y la concurrencia de `Creditos` con SQL parametrizado.

## [0.1.0] - 2026-09-30 — Scaffold del monorepo

Los paquetes existen y compilan, todavía sin funcionalidad. Decisiones en el [ADR 0012](01-arquitectura/decisions/0012-toolchain-del-monorepo.md).

### Added
- Workspace de pnpm 12.8.1 (`pnpm-workspace.yaml`) con catalogs para `typescript` y `@types/node` y `allowBuilds` para `esbuild`.
- `package.json` raíz (`modulo-creditos` 0.1.0) con los scripts `typecheck`, `lint`, `format` y `format:check`, `engines` en Node `^24.0.0` y `.nvmrc`.
- `tsconfig.base.json`: ES2024, ESNext + resolución Bundler, `strict` con extras y `types: []`.
- `eslint.config.js`: `recommendedTypeChecked` + `naming-convention` según las convenciones + `eslint-config-prettier`. `.prettierrc.json` y `.prettierignore` (ignora `docs/`).
- Paquetes `@creditos/shared`, `@creditos/api` (tsx + tsup, entradas `server.ts` y `worker.ts`), `@creditos/web` y `@creditos/webhook-mock`, cada uno con un archivo de entrada vacío.
- `02-desarrollo/setup-local.md` (parcial) y `03-operacion/troubleshooting.md` con el problema de pnpm 12 en Windows.

### Changed
- ADR 0001 y 0002: sus pendientes de toolchain pasan a resueltos en el ADR 0012.
- ADR 0003: nota sobre el tag `latest` de Prisma, que apunta a una release candidate.
- `convenciones.md`: excepción para los scripts compuestos (`format:check`) y sección de verificación automática.

### Verificado
- `pnpm typecheck`, `pnpm lint` y `pnpm format:check` pasan en los cuatro paquetes.
- Con un export temporal (ya eliminado): la API, la web y el mock resuelven `@creditos/shared`, tsup lo incluye en el bundle, `node dist/server.js` y `tsx` lo ejecutan, y el lint detecta nombres fuera de la convención.

## [0.1.0] - 2026-09-30 — Repositorio

### Added
- Repositorio git local con la rama `main` y el remoto público `origin` en [github.com/THEJUANX94/modulo-creditos](https://github.com/THEJUANX94/modulo-creditos). Todavía no tiene commits.
- `.gitignore`: dependencias, builds, `.env` (salvo `.env.example`), logs y archivos de editor y del sistema operativo.
- `.gitattributes`: finales de línea LF y binarios marcados.
- Sección "Git" y la excepción del nombre del repositorio en `02-desarrollo/convenciones.md`.

## [0.1.0] - 2026-09-30 — Trazabilidad y diseño visual

Segunda tanda de decisiones, todavía sin código.

### Added
- [ADR 0010](01-arquitectura/decisions/0010-logs-tecnicos-y-auditoria.md): logs técnicos con pino (JSON a stdout) correlacionados por requestId hasta la entrega del webhook, enmascaramiento de datos personales, y auditoría inmutable en la BD de cambios de estado, cambios de datos del crédito y eventos de seguridad.
- [ADR 0011](01-arquitectura/decisions/0011-diseno-visual-ui-ux-pro-max.md): el diseño visual del frontend se guía por la skill ui-ux-pro-max.
- `05-frontend/design-system.md`: estilo, paleta clara (banca, de la skill) y oscura (derivada) con su contraste medido, tipografía, radios, espaciado, foco, iconos y reglas de UX obligatorias.
- Sección "Trazabilidad" en `architecture.md`.

### Changed
- ADR 0002: el logger sale de sus pendientes, porque lo resuelve el ADR 0010.
- ADR 0005: los eventos de autenticación pasan a auditarse en la BD.

## [0.1.0] - 2026-09-30 — Decisiones de arquitectura

Primera entrada. Antes de escribir código se fijaron la estructura del repositorio, el stack, la estrategia del webhook y las convenciones de nombrado. Todavía no hay código.

### Added
- Estructura de documentación en `docs/` con el formato OKF (Open Knowledge Format).
- ADRs 0001 a 0009 en `01-arquitectura/decisions/`. Cada uno tiene contexto, alternativas consideradas, consecuencias y una lista de lo que queda por definir en la implementación.
- Resumen de decisiones técnicas en `01-arquitectura/decisiones-tecnicas.md`.
- Convenciones de idioma y nombrado en `02-desarrollo/convenciones.md`.
- Versión parcial de `01-arquitectura/architecture.md`: componentes, estructura del repositorio y flujo de creación de un crédito.
- Esqueleto de `setup-local.md`, `variables-entorno.md`, `deploy.md` y `troubleshooting.md`, marcados como pendientes.
