---
type: reference
tags: [config, variables-entorno, secretos]
---

# Variables de entorno

Cada componente tiene su `.env` (que git ignora) y su `.env.example` (versionado, sin secretos reales). Para empezar, se copia el `.env.example` a `.env` y se reemplazan las claves.

> La web no tiene variables de entorno: llama a la API por el mismo origen (`/api`), con el proxy de Vite en desarrollo y el de Nginx en Docker ([ADR 0021](../01-arquitectura/decisions/0021-frontend.md)).

## docker-compose — `.env` de la raíz

**`pnpm env:generar` crea este `.env` con claves aleatorias**, o le agrega a uno existente las variables que le falten, sin cambiar las que ya tiene ([ADR 0022](../01-arquitectura/decisions/0022-docker-compose-y-empaquetado.md)).

| Variable | Obligatoria | Default | Secreto | Para qué |
|---|---|---|---|---|
| `MSSQL_SA_PASSWORD` | Sí | — | **Sí** | Clave del administrador (`sa`) de SQL Server. Al menos 8 caracteres con tres de estos grupos: mayúsculas, minúsculas, números y símbolos. Se fija al crear el volumen: cambiarla después exige recrearlo (`docker compose down -v`) |
| `APP_DB_PASSWORD` | Sí | — | **Sí** | Clave del login `appCreditos`, que crea `001-crearBaseDatos.sql`. El compose arma con ella la `DATABASE_URL` de la API y del worker. En desarrollo con pnpm, tiene que coincidir con la de `DATABASE_URL` en `apps/api/.env` |
| `SQLSERVER_PORT` | No | `1433` | No | Puerto de SQL Server en la máquina local |
| `WEB_PORT` | No | `8080` | No | Puerto de la web (y de la API en `/api`) en la máquina local |
| `MOCK_PORT` | No | `4000` | No | Puerto de la página del mock en la máquina local |
| `JWT_SECRET` | Sí | — | **Sí** | Clave de los access tokens de la API: al menos 32 caracteres aleatorios |
| `WEBHOOK_SECRETO` | Sí | — | **Sí** | Secreto de la firma del webhook (`whsec_` + base64 de al menos 32 bytes). Lo reciben el worker y el mock |
| `USUARIOS_DEMO_CLAVE` | Sí | — | **Sí** | Contraseña de los cuatro usuarios demo, que crea el servicio `usuariosDemo`. Un usuario que ya existía conserva la suya |

El compose no arranca si falta una variable obligatoria, y dice cuál. Eso incluye `docker compose run dbInit`, el que usan las pruebas: un `.env` de antes del paso 8 se completa con `pnpm env:generar`.

**El compose fija el resto**, y cada servicio recibe solo las suyas:

- `NODE_ENV=development`: es un entorno para evaluar en local; producción exige https en el webhook;
- `TRUST_PROXY=1`, porque Nginx va delante;
- `CORS_ORIGINS` con el puerto de la web, y `DOCS_HABILITADA=true`;
- `WEBHOOK_URL` apuntando al mock por la red interna.

La API no recibe el secreto del webhook, el worker no recibe `JWT_SECRET` y Nginx no recibe ninguna.

## API y worker — `apps/api/.env`

La API y el worker comparten el código y el `.env` de desarrollo, pero **cada proceso valida solo sus variables** ([ADR 0018](../01-arquitectura/decisions/0018-webhook-entrega-firma-y-traza.md)): `src/config/configBase.ts` las comunes, `config.ts` las de la API y `configWorker.ts` las del worker. Si falta una o es inválida, el proceso no arranca y lista cada problema. En Docker, cada servicio recibe solo las suyas: la API nunca tiene el secreto del webhook ni el worker el `JWT_SECRET`.

### Comunes

| Variable | Obligatoria | Default | Secreto | Para qué |
|---|---|---|---|---|
| `NODE_ENV` | No | `development` | No | `development`, `test` o `production` |
| `LOG_LEVEL` | No | `info` | No | `fatal`, `error`, `warn`, `info`, `debug`, `trace` o `silent` |
| `DATABASE_URL` | Sí | — | **Sí** (trae la clave) | Conexión con el login `appCreditos`, de mínimo privilegio. Formato `sqlserver://host:puerto;database=ModuloCreditos;user=appCreditos;password={clave};encrypt=true`. `trustServerCertificate=true` solo en desarrollo |

La clave va entre llaves (`password={…}`) para que los caracteres especiales no rompan la cadena de conexión.

### La API y los scripts de desarrollo

| Variable | Obligatoria | Default | Secreto | Para qué |
|---|---|---|---|---|
| `PORT` | No | `3000` | No | Puerto HTTP de la API |
| `CORS_ORIGINS` | Sí | — | No | Orígenes del navegador que pueden llamar a la API, separados por coma. Cada uno tiene que ser una URL |
| `TRUST_PROXY` | No | `0` | No | Cuántos proxies hay delante de la API (Nginx = 1), para que la IP real llegue a la auditoría y al rate limit |
| `JWT_SECRET` | Sí | — | **Sí** | Clave HS256 de los access tokens, de al menos 32 caracteres aleatorios. Se genera con `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Cambiarla invalida todos los access tokens vigentes |
| `USUARIOS_DEMO_CLAVE` | Solo para `usuarios:crear` | — | **Sí** | Contraseña de los cuatro usuarios demo, de 12 a 128 caracteres. La lee el script, no la API |
| `DOCS_HABILITADA` | No | `true` | No | Swagger UI en `/api/docs` y el JSON en `/api/docs/openapi.json`. En un despliegue real va en `false`, para no publicar el mapa de la API |
| `DATABASE_ADMIN_URL` | Solo para `prisma db pull` | — | **Sí** | Conexión de administrador para la introspección. La lee `prisma.config.ts`, no la app. **Nunca en producción** |

### Solo el worker del webhook

| Variable | Obligatoria | Default | Secreto | Para qué |
|---|---|---|---|---|
| `WEBHOOK_URL` | Sí | — | No | Receptor del evento `credito.creado`. Tiene que ser https con `NODE_ENV=production`; en desarrollo se admite http |
| `WEBHOOK_SECRETO` | Sí | — | **Sí** | Secreto de la firma (Standard Webhooks): `whsec_` + base64 de al menos 32 bytes. El receptor tiene el mismo. Se genera con `node -e "console.log('whsec_' + require('crypto').randomBytes(32).toString('base64'))"` |
| `WEBHOOK_MAX_INTENTOS` | No | `6` | No | Intentos antes de dejar el evento `FALLIDO` (1 a 20) |
| `WEBHOOK_BACKOFF_BASE_MS` | No | `10000` | No | Espera base del backoff: base × 2^(n−1), con jitter de ±20 % |
| `WEBHOOK_TIMEOUT_MS` | No | `15000` | No | Espera máxima de la respuesta en cada intento (1000 a 30000) |
| `WEBHOOK_INTERVALO_MS` | No | `2000` | No | Cada cuánto se lee el outbox cuando no hay un lote lleno |

## Mock del sistema externo — `apps/webhookMock/.env`

Las valida `apps/webhookMock/src/config.ts` al arrancar ([ADR 0020](../01-arquitectura/decisions/0020-mock-del-sistema-externo.md)).

| Variable | Obligatoria | Default | Secreto | Para qué |
|---|---|---|---|---|
| `PORT` | No | `4000` | No | Puerto del mock. La API apunta a él con `WEBHOOK_URL` |
| `WEBHOOK_SECRETO` | Sí | — | **Sí** | El mismo de la API. Con otro, cada envío responde 401 |
| `MOCK_MODO` | No | `acepta` | No | Comportamiento al arrancar: `acepta`, `falla`, `rechaza`, `lento`, `intermitente` o `fallaPrimeros`. Se cambia en vivo desde la página |
| `MOCK_FALLAS_POR_EVENTO` | No | `2` | No | En `fallaPrimeros`: cuántos envíos de cada evento fallan antes de aceptar (1 a 10) |
| `MOCK_RETRASO_MS` | No | `20000` | No | En `lento`: cuánto tarda en responder (1000 a 120000). Mayor que `WEBHOOK_TIMEOUT_MS`, para que el worker corte por timeout |

## Pruebas

No tienen variables propias. `vitest.integracion.config.ts` toma `DATABASE_URL` (de `apps/api/.env` o del entorno) y solo cambia la BD a `ModuloCreditosPruebas`. Los secretos (`JWT_SECRET`, `WEBHOOK_SECRETO` y la contraseña de los usuarios de prueba) son aleatorios en cada corrida.

Última actualización: 2026-10-01
