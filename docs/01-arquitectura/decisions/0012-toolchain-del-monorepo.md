---
type: decision
tags: [adr, toolchain, node, typescript, pnpm, eslint, prettier, tsup]
---

# ADR 0012: Toolchain del monorepo

## Estado

Aceptado (2026-09-30).

## Contexto

Los ADR 0001 y 0002 fijaron el monorepo con pnpm, Express y React, pero dejaron pendientes las versiones y las herramientas. Las versiones vigentes en el registro de npm al momento del scaffold traían dos trampas:

- **TypeScript 7.0.2**, el compilador nativo en Go, es la versión `latest`, pero **typescript-eslint 8.71 solo admite TypeScript `<6.1.0`**.
- **El tag `latest` de Prisma apunta a `8.0.0-rc.19`**, una release candidate. La última estable es la 7.10.0. Se decide en el paso del modelo de datos ([ADR 0003](0003-sql-primero-prisma-por-introspeccion.md)).

## Decisión

| Pieza | Elección | Por qué |
|---|---|---|
| Node | **24 LTS** (`.nvmrc`, `engines: ^24.0.0`) | Es la LTS activa. Prisma 7, Vite 8 y Vitest 5 la soportan |
| pnpm | **12.8.1** (`packageManager`), instalado globalmente con npm | Es la última versión. Ver la nota de instalación más abajo |
| Versiones compartidas | **Catalogs de pnpm** (`catalog:` en `pnpm-workspace.yaml`) | `typescript` y `@types/node` se declaran una vez y los paquetes no se desalinean |
| Rangos | **`^` + `pnpm-lock.yaml`**, salvo TypeScript, que va con `~6.0.3` | El lockfile fija la versión exacta. TypeScript no puede pasar a 6.1 sin romper typescript-eslint |
| Scripts de dependencias | **`allowBuilds`** en `pnpm-workspace.yaml` (`esbuild`, `prisma` y `@prisma/engines`; `@scarf/scarf` denegado) | pnpm bloquea por defecto los scripts de instalación de terceros, y la instalación falla si alguno no está aprobado |
| TypeScript | **6.0** | Es la última versión que admite typescript-eslint, lo que habilita el lint con información de tipos |
| Rigor de TypeScript | **`strict`** + `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax` | Atrapa más errores en código financiero. `verbatimModuleSyntax` obliga a usar `import type`, que es lo correcto en ESM |
| Tipos globales | **`types: []`** en la base; `["node"]` solo en `api` y `webhookMock` | `@creditos/shared` no puede usar APIs de Node por accidente, porque también corre en el navegador |
| Módulos | **ESM** en todo el repositorio | Vite, Vitest, Zod 4 y el cliente de Prisma 7 son ESM |
| Imports | **Sin extensión**, `moduleResolution: "Bundler"` | Ningún archivo se ejecuta sin una herramienta (tsx, tsup o Vite) |
| Express | **5** | Si un handler async rechaza, el error llega solo al middleware de errores |
| `@creditos/shared` | **Se consume desde las fuentes TS** (`exports` → `src/index.ts`), sin build propio | Los cambios se ven al instante. Vite, Vitest y tsx lo compilan al vuelo |
| API en desarrollo | **`tsx watch`** (`dev`, `dev:worker`) | Reinicia al guardar, sin compilar |
| API en producción | **tsup** (esbuild): bundle ESM de `server.ts` y `worker.ts` con `@creditos/shared` incluido | La imagen de Docker corre JS plano (`node dist/server.js`) |
| Typecheck | **`tsc --noEmit`** en cada paquete (`pnpm typecheck`) | tsx, tsup y Vite no verifican tipos |
| Lint | **ESLint 10** (flat config) + **typescript-eslint `recommendedTypeChecked`** | Las reglas con tipos detectan promesas sin manejar, clave en código async con BD y webhooks |
| Convención de nombres | **`@typescript-eslint/naming-convention`** sobre identificadores | Hace cumplir camelCase y PascalCase de [convenciones.md](../../02-desarrollo/convenciones.md). Los nombres de archivo se revisan a mano |
| Formato | **Prettier**: comillas simples, punto y coma, trailing commas, 100 columnas. Ignora `docs/` | 100 columnas alcanzan para los nombres del dominio, que son largos. Los Markdown quedan como se escriben |

### Nota de instalación: pnpm 12 en Windows

pnpm 12 se distribuye como binario nativo: su paquete trae un archivo provisional que un script de instalación reemplaza por el ejecutable. Desde la versión 9.7, pnpm cambia solo a la versión de `packageManager`, pero al hacerlo **no ejecuta ese script**, y en Windows el lanzador queda roto. Por eso pnpm 12 se instala globalmente con `npm install -g pnpm@12.8.1`. Detalle en [troubleshooting.md](../../03-operacion/troubleshooting.md).

## Alternativas consideradas

- **Node 26** (current, pasa a LTS en octubre de 2026) o **Node 22** (mantenimiento).
- **TypeScript 7.** Es mucho más rápido, pero obligaría a renunciar a las reglas con tipos de typescript-eslint y a cambiar a Biome u oxlint.
- **pnpm 11.7.0**, la que estaba instalada. Evitaba tocar la herramienta global.
- **Express 4.** Requiere capturar a mano los errores de los handlers async.
- **CommonJS.** Sería distinto del frontend y obliga a interoperar entre formatos.
- **`shared` compilado a `dist/`, o project references.** Requieren un paso de build y un watch adicionales en desarrollo.
- **tsc en el build de la API.** Exige `shared` compilado. **Node nativo con type stripping**: solo admite sintaxis borrable y es menos probado en producción.
- **Biome**, o **ESLint sin Prettier**. Biome no tiene reglas con tipos al nivel de typescript-eslint.
- **`strictTypeChecked`.** Más reglas opinadas y más fricción.
- **Imports con `.js` y `NodeNext`.** Lo exige Node ESM puro, pero es extraño de leer.
- **Versiones exactas en los package.json.** El lockfile ya da esa garantía.

## Consecuencias

- **Positivas**:
  - Un solo comando por verificación: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.
  - La convención de nombres se verifica de forma automática, no solo en revisión.
  - La imagen de producción de la API no necesita TypeScript ni las fuentes de `shared`.
- **Costos aceptados**:
  - TypeScript queda fijado en la 6.0 hasta que typescript-eslint soporte la 7.
  - Quien clone el repositorio en Windows necesita pnpm 12 instalado globalmente con npm. No basta con el cambio automático de versión de pnpm.
  - tsx y tsup no verifican tipos: `pnpm typecheck` tiene que correr aparte (y en CI).
  - Cada dependencia nueva con scripts de instalación (por ejemplo, Prisma) hay que aprobarla en `allowBuilds`. También sirve para **denegar**: `@scarf/scarf`, la telemetría de instalación que trae `swagger-ui-dist`, está en `false` y no se ejecuta.

## Verificación

Durante el scaffold se verificó con un export temporal en `shared`, eliminado después:

- La API, la web y el mock resuelven `@creditos/shared` y `pnpm typecheck` pasa en los cuatro paquetes.
- tsup incluye `shared` en el bundle, `node dist/server.js` lo ejecuta y `tsx` también.
- El lint marca `MAX_VALOR`, `nombre_mal` y `type tipoMal`, y acepta propiedades como `DATABASE_URL`, `SOLICITADO` y `'X-Request-Id'`.

## Por definir en la implementación

- Las reglas de lint específicas de React (hooks), al crear la web.
- La configuración de Vitest (paso de pruebas).

Última actualización: 2026-10-01
