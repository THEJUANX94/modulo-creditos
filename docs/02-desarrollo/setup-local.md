---
type: reference
tags: [setup, desarrollo, pnpm, node, docker]
---

# Configurar el entorno de desarrollo local

> **Parcial.** Cubre el workspace, la base de datos y la API. El worker, la web y el mock se agregan en sus pasos.

## Requisitos

| Herramienta | Versión | Cómo verificar |
|---|---|---|
| Node.js | 24 LTS (ver `.nvmrc`) | `node -v` |
| pnpm | 12.8.1 (ver `packageManager` en `package.json`) | `pnpm -v` |
| Docker Desktop | Con Docker Compose v2 | `docker compose version` |
| Git | Cualquier versión reciente | `git --version` |

**pnpm 12 se instala de forma global con npm**:

```bash
npm install -g pnpm@12.8.1
```

En Windows no basta con el cambio automático de versión de pnpm. Ver [troubleshooting.md](../03-operacion/troubleshooting.md#pnpm-12-no-arranca-en-windows-no-se-reconoce-como-un-comando).

## Primer arranque

1. **Variables de entorno.** Copiar `.env.example` a `.env` en la raíz, y `apps/api/.env.example` a `apps/api/.env`, y reemplazar las claves. `APP_DB_PASSWORD` de la raíz tiene que coincidir con la clave de `DATABASE_URL` de la API. Detalle en [variables-entorno.md](variables-entorno.md).
2. **Base de datos.** El compose levanta SQL Server 2022, y `dbInit` corre los scripts de `database/` si la BD no existe:

   ```bash
   docker compose up -d
   ```

   El primer arranque descarga la imagen de SQL Server (unos 2,3 GB) y la licencia es la de la edición Developer: **solo para desarrollo y pruebas**. Los datos quedan en el volumen `sqlserverDatos` y sobreviven a `docker compose down`. Para borrarlos y recrear la BD desde cero:

   ```bash
   docker compose down -v
   ```

3. **Dependencias.** `pnpm install` también genera el cliente de Prisma (postinstall):

   ```bash
   pnpm install
   ```

4. **API**, con recarga al guardar y logs legibles:

   ```bash
   pnpm -F @creditos/api dev
   ```

   Comprobar que responde con `GET http://localhost:3000/api/health/ready`.

pnpm bloquea los scripts de instalación de las dependencias que no están en `allowBuilds` (`pnpm-workspace.yaml`). Si agregas una dependencia que los necesita, la instalación falla con `ERR_PNPM_IGNORED_BUILDS`: agrégala a `allowBuilds` y vuelve a instalar.

## Cuando cambia el esquema

`database/*.sql` es la fuente de verdad. Después de cambiar un script:

1. Recrear la BD con `docker compose down -v` y `docker compose up -d`.
2. Introspeccionar, que reescribe `apps/api/prisma/schema.prisma` (no se edita a mano):

   ```bash
   pnpm -F @creditos/api prisma:pull
   ```

3. Regenerar el cliente:

   ```bash
   pnpm -F @creditos/api prisma:generate
   ```

`prisma:pull` usa `DATABASE_ADMIN_URL` (administrador); la app usa `DATABASE_URL` (`appCreditos`).

## Verificar el código

Desde la raíz:

| Comando | Qué hace |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` en cada paquete |
| `pnpm lint` | ESLint con reglas con tipos y la convención de nombres |
| `pnpm format` | Formatea con Prettier (no toca `docs/`) |
| `pnpm format:check` | Verifica el formato sin modificar archivos |

## Crear la base de datos sin Docker

Contra un SQL Server 2022 propio, los scripts de `database/` se ejecutan **en orden, una sola vez, sobre una instancia donde `ModuloCreditos` no existe**, con un login administrador y con `sqlcmd`:

```bash
sqlcmd -S <servidor> -U sa -P <clave sa> -C -f 65001 -v APP_DB_PASSWORD="<clave del login de la app>" -i database/001-crearBaseDatos.sql
```

```bash
sqlcmd -S <servidor> -U sa -P <clave sa> -C -f 65001 -i database/002-esquema.sql
```

```bash
sqlcmd -S <servidor> -U sa -P <clave sa> -C -f 65001 -i database/003-catalogos.sql
```

| Opción | Por qué |
|---|---|
| `-f 65001` | Los scripts son UTF-8; sin esta opción, las tildes de los catálogos llegan dañadas |
| `-v APP_DB_PASSWORD=…` | La contraseña del login `appCreditos` no está en el repositorio |
| `-C` | Confía en el certificado autofirmado del contenedor (solo en desarrollo) |

Los scripts usan directivas de sqlcmd (`:on error exit`, `$(VARIABLE)`). En SSMS o Azure Data Studio hay que activar el modo SQLCMD.

## Comandos por paquete

Se ejecutan con `pnpm -F <paquete> <script>`, por ejemplo `pnpm -F @creditos/api build`.

| Paquete | Scripts |
|---|---|
| `@creditos/api` | `dev` (API con recarga), `dev:worker` (worker con recarga), `build` (bundle con tsup en `dist/`), `start`, `start:worker`, `typecheck`, `prisma:pull`, `prisma:generate` |
| `@creditos/web` | `typecheck` |
| `@creditos/webhook-mock` | `typecheck` |
| `@creditos/shared` | `typecheck` |

Última actualización: 2026-09-30
