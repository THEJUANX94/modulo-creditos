---
type: reference
tags: [config, variables-entorno, secretos]
---

# Variables de entorno

Cada componente tiene su `.env` (que git ignora) y su `.env.example` (versionado, sin secretos reales). Para empezar, se copia el `.env.example` a `.env` y se reemplazan las claves.

> *Parcial.* Faltan las variables del worker y del webhook (paso 4d), del mock (paso 6) y de la web (paso 7).

## docker-compose — `.env` de la raíz

| Variable | Obligatoria | Default | Secreto | Para qué |
|---|---|---|---|---|
| `MSSQL_SA_PASSWORD` | Sí | — | **Sí** | Clave del administrador (`sa`) de SQL Server. SQL Server exige al menos 8 caracteres con mayúsculas, minúsculas, números y símbolos |
| `APP_DB_PASSWORD` | Sí | — | **Sí** | Clave del login `appCreditos`, que crea `001-crearBaseDatos.sql`. Tiene que coincidir con la de `DATABASE_URL` en `apps/api/.env` |
| `SQLSERVER_PORT` | No | `1433` | No | Puerto de SQL Server en la máquina local |

El compose no arranca si falta una variable obligatoria, y dice cuál.

## API — `apps/api/.env`

Las valida `apps/api/src/config/config.ts` al arrancar: si falta una o es inválida, la API no arranca y lista cada problema.

| Variable | Obligatoria | Default | Secreto | Para qué |
|---|---|---|---|---|
| `NODE_ENV` | No | `development` | No | `development`, `test` o `production` |
| `PORT` | No | `3000` | No | Puerto HTTP de la API |
| `LOG_LEVEL` | No | `info` | No | `fatal`, `error`, `warn`, `info`, `debug`, `trace` o `silent` |
| `DATABASE_URL` | Sí | — | **Sí** (trae la clave) | Conexión con el login `appCreditos`, de mínimo privilegio. Formato `sqlserver://host:puerto;database=ModuloCreditos;user=appCreditos;password={clave};encrypt=true`. `trustServerCertificate=true` solo en desarrollo |
| `CORS_ORIGINS` | Sí | — | No | Orígenes del navegador que pueden llamar a la API, separados por coma. Cada uno tiene que ser una URL |
| `TRUST_PROXY` | No | `0` | No | Cuántos proxies hay delante de la API (Nginx = 1), para que la IP real llegue a la auditoría y al rate limit |
| `JWT_SECRET` | Sí | — | **Sí** | Clave HS256 de los access tokens, de al menos 32 caracteres aleatorios. Se genera con `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Cambiarla invalida todos los access tokens vigentes |
| `USUARIOS_DEMO_CLAVE` | Solo para `usuarios:crear` | — | **Sí** | Contraseña de los cuatro usuarios demo, de 12 a 128 caracteres. La lee el script, no la API |
| `DOCS_HABILITADA` | No | `true` | No | Swagger UI en `/api/docs` y el JSON en `/api/docs/openapi.json`. En un despliegue real va en `false`, para no publicar el mapa de la API |
| `DATABASE_ADMIN_URL` | Solo para `prisma db pull` | — | **Sí** | Conexión de administrador para la introspección. La lee `prisma.config.ts`, no la app. **Nunca en producción** |

La clave va entre llaves (`password={…}`) para que los caracteres especiales no rompan la cadena de conexión.

Última actualización: 2026-10-01
