---
type: decision
tags: [adr, docker, docker-compose, nginx, seguridad, operacion]
---

# ADR 0022: Docker — imágenes, docker-compose del sistema completo y endurecimiento

## Estado

Aceptado (2026-10-01). Implementado en el paso 8. Verificado levantando el sistema con un solo comando, con el flujo completo por Nginx y el apagado ordenado en Linux.

## Contexto

El enunciado recomienda un `docker-compose.yml` que levante el frontend, el backend y SQL Server: no es obligatorio, pero cuenta como diferenciador. El [ADR 0001](0001-monorepo-pnpm-workspaces.md) decidió que el compose levanta el sistema completo. Hasta el paso 7 solo tenía la infraestructura de desarrollo (`sqlserver` y `dbInit`).

Quedaban pendientes de pasos anteriores:

- verificar el apagado ordenado de la API y del worker, que en Windows no se puede probar ([ADR 0015](0015-contrato-http-y-base-de-la-api.md), [ADR 0018](0018-webhook-entrega-firma-y-traza.md));
- cómo se cumple la regla "https en producción" del worker con el mock en http ([ADR 0018](0018-webhook-entrega-firma-y-traza.md));
- el script del tema, que era inline en `index.html` y choca con una CSP estricta ([ADR 0021](0021-frontend.md)).

## Decisión

### Imágenes

| Pieza | Elección | Por qué |
|---|---|---|
| Dockerfile | **Uno solo en la raíz, con targets**: `api` (la API y el worker), `webhookMock` y `web` | Las apps comparten el workspace de pnpm (lockfile y `@creditos/shared`): la instalación y el build corren una sola vez para las tres |
| Etapas | `dependencias` descarga los paquetes solo con el lockfile (`pnpm fetch`); `build` instala sin red, compila y prepara las dependencias de producción; las imágenes finales copian solo lo necesario | Mientras el lockfile no cambie, la descarga sale de caché. Las imágenes finales no tienen ni el código fuente ni las herramientas de build |
| Dependencias de producción | **`pnpm deploy --prod`**, que las vuelve a resolver para cada app | Deja fuera las dependencias *peer* opcionales: `@prisma/client` declara la CLI de Prisma, que trae Studio, TypeScript y React. Con `--legacy` se colaban: la imagen de la API pesaba 800 MB; sin él, 466 MB |
| Base de Node | **`node:24.21.0-alpine3.24`** | Pequeña y con pocos paquetes que parchear. Prisma 7 con adapter no usa motor nativo y `@node-rs/argon2` trae binario para musl |
| Base de la web | **`nginxinc/nginx-unprivileged:1.31.6-alpine3.24`** | Nginx corre como el usuario `nginx` y escucha en 8080: no necesita ningún privilegio |
| SQL Server | **`mssql/server:2022-CU27-ubuntu-22.04`** | La misma imagen que `2022-latest` hoy, con nombre fijo |
| Usuario | Los archivos de la app son de root y el proceso corre como `node` | El proceso no puede modificar su propio código |

**Versiones exactas en todas las imágenes**: dos builds en días distintos dan el mismo resultado. Las actualizaciones se proponen con Dependabot o Renovate (paso 9).

### El compose

| Servicio | Qué hace | Salud |
|---|---|---|
| `sqlserver` | SQL Server 2022 con su volumen | `sqlcmd SELECT 1` |
| `dbInit` | Crea la BD con los scripts de `database/` si no existe, y termina | — |
| `usuariosDemo` | Crea un usuario por rol si no existe (idempotente), y termina | — |
| `api` | La API, con `TRUST_PROXY=1` porque Nginx va delante | `GET /api/health/ready`: la API y la BD responden |
| `worker` | El worker del webhook, la misma imagen con `node dist/worker.js` | Latido: el archivo `/tmp/latidoWorker` tiene menos de 60 s |
| `web` | Nginx: el build de Vite y `/api` reenviado a la API | `GET /` |
| `webhookMock` | El sistema externo que recibe `credito.creado` | `GET /salud` |

- **`docker compose up` levanta todo.** El orden lo dan las dependencias: la BD sana → `dbInit` terminado → la API, el worker y los usuarios demo → la web, cuando la API está sana. Para desarrollar con pnpm se levanta solo la infraestructura: `docker compose up -d sqlserver dbInit`.
- **Puertos en la máquina**: la web en `8080` (con Swagger en `/api/docs`), la página del mock en `4000` y SQL Server en `1433`. **La API y el worker solo están en la red interna**: todo entra por Nginx, como en producción. El compose no choca con la API de desarrollo en el 3000.
- **`NODE_ENV=development` en el compose.** Es un entorno para evaluar en local, no producción. Así la regla del worker "con `production`, `WEBHOOK_URL` tiene que ser https" sigue sin excepciones, y el webhook va al mock por http. Las imágenes traen `NODE_ENV=production` por defecto. Hoy `NODE_ENV` solo cambia esa validación.
- **El latido del worker**: el ciclo escribe el archivo al empezar cada vuelta. Si el ciclo se cuelga, el archivo envejece y el contenedor queda `unhealthy`. Con la BD caída, el ciclo sigue vivo (registra el error y espera), así que el latido mide el worker y no la BD. Los 60 s tienen que superar una vuelta completa: el intervalo (2 s) más un lote con el timeout de cada envío (15 s).

### Secretos

- **Todas las variables del compose están en el `.env` de la raíz**, obligatorias con `${VAR:?}`: si falta una, el compose no arranca y dice cuál. El compose arma la `DATABASE_URL` con `APP_DB_PASSWORD`.
- **`pnpm env:generar`** (`scripts/generarEnv.ts`) crea el `.env` a partir de `.env.example` con claves aleatorias. Si el `.env` ya existe, solo agrega las variables que le falten: nunca cambia una existente, porque la clave de `sa` queda fijada en el volumen de SQL Server.
- **Cada servicio recibe solo sus variables**: la API no tiene el secreto del webhook, el worker no tiene `JWT_SECRET` y Nginx no tiene ninguna.

### Endurecimiento

Los contenedores propios (la API, el worker, los usuarios demo, la web y el mock) corren:

- **con el sistema de archivos de solo lectura**, y `/tmp` en memoria;
- **sin capabilities de Linux** (`cap_drop: ALL`) y sin poder escalar privilegios (`no-new-privileges`);
- **con un usuario sin privilegios**;
- **con `init: true`**: tini es el PID 1, reenvía las señales al proceso y recoge los procesos huérfanos;
- **con `restart: unless-stopped`**;
- **con logs `json-file` rotados**: 10 MB por archivo y 3 archivos, en todos los servicios. Las apps ya escriben JSON a stdout ([ADR 0010](0010-logs-tecnicos-y-auditoria.md)).

SQL Server y `dbInit` quedan con la configuración de su imagen, que ya corre con el usuario `mssql`.

### Nginx

- **`/api/`** se reenvía a `api:3000`, con `X-Forwarded-For` y `X-Forwarded-Proto`, y el mismo límite de cuerpo que la API (100 KB). La dirección de la API va en una variable con el DNS de Docker: si la API se reinicia con otra IP, Nginx la vuelve a resolver.
- **A `/api/` no se le agregan cabeceras de seguridad**: las pone Helmet en la API, y una segunda CSP se sumaría a la suya y rompería Swagger.
- **Los archivos de `/assets/`** llevan hash en el nombre: caché de un año, `immutable`. **`index.html` y `tema.js`** se revalidan siempre (`no-cache`), así que un despliegue nuevo se ve de inmediato.
- **Cualquier otra ruta responde `index.html`**: las rutas de React Router se pueden recargar o compartir.
- **gzip** para CSS, JavaScript, JSON y SVG. Sin la versión de Nginx en las respuestas.

### Cabeceras de seguridad de la web

| Cabecera | Valor | Para qué |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'`, `script-src 'self'` sin excepciones, `style-src 'self' 'unsafe-inline'`, `frame-ancestors 'none'`, `object-src 'none'` | Un XSS no puede cargar ni ejecutar código de otro origen ni inline |
| `X-Frame-Options` | `DENY` | Lo mismo que `frame-ancestors` para navegadores viejos: nadie embebe la app (clickjacking) |
| `X-Content-Type-Options` | `nosniff` | El navegador no adivina tipos |
| `Referrer-Policy` | `no-referrer` | Las URLs (con filtros de búsqueda) no salen a otros sitios |
| `Permissions-Policy` | Sin cámara, micrófono, ubicación ni pagos | La app no los usa |
| `Cross-Origin-Opener-Policy` | `same-origin` | Otra pestaña no puede manipular la ventana de la app |

- **El script del tema pasa a `public/tema.js`**, cargado en el `<head>` sin `defer`: sigue corriendo antes de pintar, y la CSP no necesita ni hash ni `'unsafe-inline'` para scripts.
- **`style-src` admite `'unsafe-inline'`** por el `<style>` que inserta Sonner al cargar. Los estilos que React pone en los elementos no los bloquea la CSP. Inyectar estilos es mucho menos grave que inyectar scripts.
- **Sin HSTS**: en local es http. En producción la agrega quien termina TLS (paso 9).

## Alternativas consideradas

- **Un Dockerfile por app**: más fácil de leer por separado, pero cada uno repite la instalación del workspace.
- **`node:24-slim`** (Debian, glibc): más compatible con binarios nativos, unos 80 MB más grande. **Distroless**: sin shell, la superficie mínima, pero sin forma de depurar ni de hacer el healthcheck con `wget`.
- **CSP con el hash del script inline**: un cambio de un espacio en el script rompe el hash y el tema deja de aplicarse sin aviso. **`'unsafe-inline'` en scripts**: anula la protección contra XSS.
- **`NODE_ENV=production` con una variable que permita http**: deja en el código una forma de desactivar el https en producción. **https real en el mock**, con un certificado autofirmado: más realista, pero hay que generarlo y montarlo.
- **Perfiles en el compose** (la infraestructura por defecto y el sistema completo con `--profile app`): quien evalúa tendría que conocer el flag.
- **Usuarios demo con un comando manual**: un paso más para quien evalúa.
- **Publicar también la API**: se podría probar sin Nginx, pero no es como se desplegaría.
- **Docker secrets (archivos)**: más cercano a producción, pero la configuración tendría que leer archivos además de variables. **Copiar `.env.example` a mano**: el riesgo es arrancar con las claves de ejemplo.
- **Un endpoint HTTP de salud en el worker**: un servidor más que mantener. **Sin healthcheck en el worker**: un ciclo colgado pasaría desapercibido.
- **Solo un usuario sin privilegios**, sin el resto del endurecimiento.
- **Imágenes por versión mayor** (`node:24-alpine`) o **por digest**: la primera cambia sola entre builds; la segunda es ilegible.
- **Logs sin rotar**: en una máquina que corre mucho tiempo, llenan el disco.

## Consecuencias

- **Positivas**:
  - El sistema completo se levanta con dos comandos (`pnpm env:generar` y `docker compose up -d --build`), sin instalar Node ni pnpm y sin escribir secretos a mano.
  - Todo entra por un solo origen, como en producción: la cookie del refresh, el rate limit por IP y la CSP se prueban tal como se desplegarían.
  - Un contenedor comprometido no puede escribir en su sistema de archivos, ni modificar su código, ni ganar privilegios.
  - El apagado ordenado está verificado en Linux.
- **Costos aceptados**:
  - **El compose no es producción**: http, `NODE_ENV=development`, el certificado autofirmado de SQL Server y la edición Developer. La propuesta productiva va en el paso 9.
  - **La imagen de la API pesa 466 MB**: la mayor parte es `@prisma/client`, que trae los motores de consulta de todas las bases de datos.
  - **`docker compose run dbInit`**, el que usan las pruebas, también exige todas las variables del `.env`: un `.env` de antes del paso 8 hay que completarlo con `pnpm env:generar`.
  - **Los usuarios demo que ya existían conservan su contraseña**: `usuariosDemo` no toca un usuario existente.
  - **Docker no reinicia un contenedor `unhealthy`** fuera de un orquestador: el estado se ve en `docker compose ps`. En Kubernetes o ECS, el mismo chequeo sí lo reemplaza.
  - **Cada healthcheck de la API deja una línea de log cada 10 s.**

## Verificación (2026-10-01)

Con Docker 29.4 y Compose 5.1, en Windows con WSL2:

- **`docker compose up -d --build --wait`**: los siete servicios llegan a `healthy` o a `Exited (0)`. `dbInit` y `usuariosDemo` no hacen nada si la BD y los usuarios ya existen.
- **Flujo por Nginx (`localhost:8080`)**:
  - login con la cookie del refresh;
  - creación de un crédito;
  - el webhook entregado al mock en el primer intento;
  - la IP del cliente registrada en la auditoría es la real, no la de Nginx.
- **Cabeceras**:
  - la CSP y las demás en `/` y en `/assets/`;
  - `/assets/` con caché de un año y gzip; `index.html` y `tema.js` con `no-cache`;
  - una ruta de la SPA (`/creditos/nuevo`) responde 200;
  - Swagger en `/api/docs` responde con una sola CSP, la de Helmet.
- **En el navegador**:
  - login;
  - el dashboard con el gráfico;
  - el tema aplicado desde `tema.js`;
  - una recarga en `/creditos?estado=SOLICITADO` recupera la sesión y el filtro;
  - ningún bloqueo de la CSP en la consola (solo el 401 esperado del refresh inicial).
- **Apagado ordenado en Linux**, con el mock en modo lento y un envío en curso:
  - `docker compose stop worker api` tardó 13 s;
  - el worker esperó el envío, registró el `TIMEOUT` y terminó con código 0;
  - la API cerró sus conexiones y terminó con código 0;
  - al volver a levantarlo, el evento se entregó en el intento 2.
- **Healthcheck del worker**: sano con el latido al día; con el archivo fechado en 2020, el chequeo falla.
- **Solo lectura**: escribir en `/app` falla con "Read-only file system".
- **`pnpm env:generar`**: desde cero crea las 8 variables, sin ningún valor de ejemplo; sobre un `.env` existente agrega solo las que faltan.
- **`pnpm test`** (233 pruebas), typecheck, lint y formato en verde.

Última actualización: 2026-10-01
