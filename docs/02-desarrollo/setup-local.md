---
type: reference
tags: [setup, desarrollo, pnpm, node, docker]
---

# Configurar el entorno de desarrollo local

> Cubre el workspace, la base de datos, la API, el worker, el mock del sistema externo, la web y las pruebas. El sistema completo con un solo `docker compose` llega en el paso 8.

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

1. **Variables de entorno.** Copiar a `.env` el `.env.example` de la raíz, el de `apps/api` y el de `apps/webhookMock`, y reemplazar las claves. `APP_DB_PASSWORD` de la raíz tiene que coincidir con la clave de `DATABASE_URL` de la API, y `WEBHOOK_SECRETO` tiene que ser el mismo en la API y en el mock. Detalle en [variables-entorno.md](variables-entorno.md).
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

4. **Usuarios demo**, uno por rol (`asesor@`, `analista@`, `tesoreria@` y `admin@creditos.test`), con la contraseña de `USUARIOS_DEMO_CLAVE`. Es idempotente:

   ```bash
   pnpm -F @creditos/api usuarios:crear
   ```

5. **API**, con recarga al guardar y logs legibles:

   ```bash
   pnpm -F @creditos/api dev
   ```

   Comprobar que responde con `GET http://localhost:3000/api/health/ready`. La documentación interactiva está en **http://localhost:3000/api/docs**: haz login en `POST /api/auth/login`, copia el `accessToken` y pégalo en **Authorize**.

6. **Mock del sistema externo**, en otra terminal. Recibe el webhook en `http://localhost:4000/webhooks/creditos`:

   ```bash
   pnpm -F @creditos/webhook-mock dev
   ```

   Su página, **http://localhost:4000**, muestra lo que recibió y cambia en vivo cómo responde: acepta, falla, rechaza, lento, intermitente o falla los primeros N envíos. Ver el [ADR 0020](../01-arquitectura/decisions/0020-mock-del-sistema-externo.md).

7. **Worker del webhook**, en otra terminal. Envía los eventos `credito.creado` a `WEBHOOK_URL`:

   ```bash
   pnpm -F @creditos/api dev:worker
   ```

   La traza se consulta como ADMIN en `GET /api/webhooks/eventos`. Sin el mock arriba, cada evento queda en `ERROR_RED` y, tras los reintentos, en `FALLIDO`.

8. **Web**, en otra terminal:

   ```bash
   pnpm -F @creditos/web dev
   ```

   Abrir **http://localhost:5173** y entrar con un usuario demo. Vite reenvía `/api` a la API (`localhost:3000`): la web y la API comparten origen, así que la cookie del refresh funciona sin CORS ([ADR 0021](../01-arquitectura/decisions/0021-frontend.md)).

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
| `pnpm test` | Todas las pruebas (Vitest): unitarias e integración. Ver más abajo |
| `pnpm test:coverage` | Lo mismo, con el reporte de cobertura (texto y `coverage/index.html`) |

## Pruebas automatizadas

```bash
pnpm test
```

- **Las de integración necesitan Docker** con el compose de desarrollo (`docker compose up -d`). Antes de correrlas, el setup recrea la BD `ModuloCreditosPruebas` con los scripts de `database/` y crea un usuario por rol. La BD de desarrollo no se toca.
- **No hace falta configurar nada**: la conexión sale de `DATABASE_URL` de `apps/api/.env`, cambiando solo el nombre de la BD, y los secretos de las pruebas son aleatorios.
- **Las unitarias corren sin Docker**, en unos segundos:

  ```bash
  pnpm vitest run --project shared --project api-unitarias
  ```

- Usan los puertos 4100 (receptor del webhook) y 3998 (prueba de configuración de la API).

Qué cubre cada archivo: [ADR 0019](../01-arquitectura/decisions/0019-implementacion-de-las-pruebas.md).

## Crear la base de datos sin Docker

Contra un SQL Server 2022 propio, los scripts de `database/` se ejecutan **en orden, una sola vez, sobre una instancia donde `ModuloCreditos` no existe**, con un login administrador y con `sqlcmd`. El nombre de la BD va en `NOMBRE_BD`:

```bash
sqlcmd -S <servidor> -U sa -P <clave sa> -C -f 65001 -v NOMBRE_BD=ModuloCreditos APP_DB_PASSWORD="<clave del login de la app>" -i database/001-crearBaseDatos.sql
```

```bash
sqlcmd -S <servidor> -U sa -P <clave sa> -C -f 65001 -v NOMBRE_BD=ModuloCreditos -i database/002-esquema.sql
```

```bash
sqlcmd -S <servidor> -U sa -P <clave sa> -C -f 65001 -v NOMBRE_BD=ModuloCreditos -i database/003-catalogos.sql
```

| Opción | Por qué |
|---|---|
| `-f 65001` | Los scripts son UTF-8; sin esta opción, las tildes de los catálogos llegan dañadas |
| `-v NOMBRE_BD=…` | El nombre de la BD. Las pruebas usan los mismos scripts con `ModuloCreditosPruebas` |
| `-v APP_DB_PASSWORD=…` | La contraseña del login `appCreditos` no está en el repositorio |
| `-C` | Confía en el certificado autofirmado del contenedor (solo en desarrollo) |

Los scripts usan directivas de sqlcmd (`:on error exit`, `$(VARIABLE)`). En SSMS o Azure Data Studio hay que activar el modo SQLCMD.

## Comandos por paquete

Se ejecutan con `pnpm -F <paquete> <script>`, por ejemplo `pnpm -F @creditos/api build`.

| Paquete | Scripts |
|---|---|
| `@creditos/api` | `dev` (API con recarga), `dev:worker` (worker con recarga), `build` (bundle con tsup en `dist/`), `start`, `start:worker`, `typecheck`, `prisma:pull`, `prisma:generate`, `usuarios:crear` |
| `@creditos/web` | `dev` (Vite con recarga), `build` (typecheck + build de producción en `dist/`), `preview`, `typecheck` |
| `@creditos/webhook-mock` | `dev` (mock con recarga), `build` (bundle con tsup), `start`, `typecheck` |
| `@creditos/shared` | `typecheck` |

Última actualización: 2026-10-01
