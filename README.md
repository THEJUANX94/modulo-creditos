# Módulo de Créditos

Módulo de créditos para el sector financiero solidario: registra, consulta, actualiza y cambia el estado de las solicitudes de crédito de los asociados, guarda su historial y **notifica cada crédito creado a un sistema externo por webhook**. Es la solución a la prueba técnica de OPA SAS para Desarrollador Semi Senior.

- **API REST** en Express y TypeScript, sobre **SQL Server 2022**, con Swagger.
- **Webhook `credito.creado`** con outbox transaccional, firma HMAC (Standard Webhooks), reintentos con backoff y traza de cada intento.
- **Frontend** en React: dashboard, listado con filtros, creación, detalle con historial, y para el administrador, usuarios y la traza del webhook.
- **Seguridad**: sesión única por usuario, roles y permisos, "cuatro ojos" en la aprobación y el desembolso, auditoría inmutable.

## Levantar el sistema

Solo necesita **Docker Desktop** (o Docker Engine con Compose v2).

```bash
pnpm env:generar
```

Crea el `.env` con claves aleatorias. Si no tiene Node ni pnpm, el mismo script corre en un contenedor (comando en [setup-local.md](docs/02-desarrollo/setup-local.md#levantar-el-sistema-completo-con-docker)).

```bash
docker compose up -d --build --wait
```

La primera vez descarga SQL Server (unos 2,3 GB) y construye las imágenes: un par de minutos. Cuando termina, todo está sano (`docker compose ps` lo muestra).

| Qué                                                              | Dónde                          |
| ---------------------------------------------------------------- | ------------------------------ |
| **La web**                                                       | http://localhost:8080          |
| **Swagger / OpenAPI**                                            | http://localhost:8080/api/docs |
| **Mock del sistema externo** (lo que recibió, y su modo en vivo) | http://localhost:4000          |
| SQL Server                                                       | `localhost:1433`               |

**Usuarios demo**, todos con la contraseña de `USUARIOS_DEMO_CLAVE` en el `.env`:

| Usuario                   | Rol       | Puede                                                 |
| ------------------------- | --------- | ----------------------------------------------------- |
| `asesor@creditos.test`    | ASESOR    | Crear, editar y eliminar solicitudes; cancelar        |
| `analista@creditos.test`  | ANALISTA  | Pasar a estudio, aprobar o rechazar; cancelar         |
| `tesoreria@creditos.test` | TESORERIA | Desembolsar                                           |
| `admin@creditos.test`     | ADMIN     | Todo lo anterior, más usuarios y la traza del webhook |

> Cada usuario tiene **una sola sesión**: entrar con el mismo usuario en otro navegador cierra la primera. Para probar dos roles a la vez, usa dos usuarios distintos.

Para detener: `docker compose down` (conserva la BD) o `docker compose down -v` (la borra).

## Recorrido de 5 minutos

1. **Crear un crédito.** Entra como `asesor@` → _Nuevo crédito_. Prueba un monto negativo o una identificación con letras: cada error aparece bajo su campo, en español. Al guardar, el detalle muestra la **notificación al sistema externo**, que pasa sola de _Pendiente_ a _Entregado_.
2. **Ver lo que recibió el sistema externo.** En http://localhost:4000 está el evento recibido, con su `webhook-id`. El mock verifica la firma: con otra firma respondería 401.
3. **Ver los reintentos.** En esa página cambia el modo a **falla** y crea otro crédito: el worker reintenta con espera creciente. Entra como `admin@` → _Webhook_ para ver cada intento. Con el modo **acepta** de nuevo, el evento se entrega en uno de los reintentos siguientes.
4. **Recorrer el ciclo de vida.** `asesor@` crea → `analista@` lo pasa a estudio y lo aprueba → `tesoreria@` lo desembolsa. Cada cambio queda en el **historial**. El mismo usuario no puede aprobar lo que registró ni desembolsar lo que aprobó: la API responde 403, aunque sea ADMIN.
5. **Probar la API** en Swagger: haz login en `POST /api/auth/login`, copia el `accessToken` y pégalo en **Authorize**.

## Pruebas automatizadas

**233 pruebas** (Vitest y Supertest): reglas de negocio, seguridad, webhook, scripts SQL, contrato de Swagger y el frontend. Las de integración corren contra **SQL Server real**, en una BD de pruebas que se recrea en cada corrida; la de desarrollo no se toca.

Con el sistema ya levantado:

```bash
pnpm install
```

```bash
cp apps/api/.env.example apps/api/.env
```

En `apps/api/.env`, reemplaza en `DATABASE_URL` la clave por la `APP_DB_PASSWORD` del `.env` de la raíz. Después:

```bash
pnpm test
```

Las unitarias no necesitan Docker: `pnpm vitest run --project shared --project api-unitarias`. También hay `pnpm lint`, `pnpm typecheck` y `pnpm test:coverage`. Detalle en [setup-local.md](docs/02-desarrollo/setup-local.md).

## Dónde está cada entregable

| Entregable                      | Dónde                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Código fuente                   | [`apps/api`](apps/api), [`apps/web`](apps/web), [`apps/webhookMock`](apps/webhookMock) y [`packages/shared`](packages/shared)                                                                                                                                                                             |
| Script SQL                      | [`database/`](database): `001` crea la BD y el login de mínimo privilegio, `002` el esquema y `003` los catálogos                                                                                                                                                                                         |
| API REST                        | [`apps/api/src/modules`](apps/api/src/modules), documentada en Swagger (`/api/docs`)                                                                                                                                                                                                                      |
| Frontend                        | [`apps/web`](apps/web); el sistema visual en [design-system.md](docs/05-frontend/design-system.md)                                                                                                                                                                                                        |
| Implementación del webhook      | [`apps/api/src/modules/webhooks`](apps/api/src/modules/webhooks) y el worker [`worker.ts`](apps/api/src/worker.ts); el diseño en el [ADR 0006](docs/01-arquitectura/decisions/0006-webhook-outbox-transaccional.md) y el [ADR 0018](docs/01-arquitectura/decisions/0018-webhook-entrega-firma-y-traza.md) |
| Swagger / OpenAPI               | http://localhost:8080/api/docs, generado desde los mismos esquemas Zod que validan la API                                                                                                                                                                                                                 |
| Pruebas automatizadas           | `apps/api/tests`, `packages/shared/tests` y `apps/web/tests`                                                                                                                                                                                                                                              |
| `.env.example` sin secretos     | [raíz](.env.example), [`apps/api`](apps/api/.env.example) y [`apps/webhookMock`](apps/webhookMock/.env.example)                                                                                                                                                                                           |
| Docker                          | [`docker-compose.yml`](docker-compose.yml) y [`Dockerfile`](Dockerfile)                                                                                                                                                                                                                                   |
| Diagrama de arquitectura        | [architecture.md](docs/01-arquitectura/architecture.md), con el de producción en [deploy.md](docs/03-operacion/deploy.md)                                                                                                                                                                                 |
| Modelo de datos                 | [modelo-datos.md](docs/01-arquitectura/modelo-datos.md), con su diagrama entidad-relación                                                                                                                                                                                                                 |
| Principales decisiones técnicas | [decisiones-tecnicas.md](docs/01-arquitectura/decisiones-tecnicas.md): una línea por decisión, con enlace a su ADR (el porqué y las alternativas descartadas)                                                                                                                                             |
| Despliegue en producción        | [deploy.md](docs/03-operacion/deploy.md): HTTPS, secretos, backup, logs, health checks, monitoreo y CI/CD                                                                                                                                                                                                 |

## Estructura

```
.
├─ apps/
│  ├─ api/           API Express, y el worker del webhook (el mismo código, otro proceso)
│  ├─ web/           React + Vite + Tailwind + shadcn/ui, servido por Nginx en Docker
│  └─ webhookMock/   El sistema externo simulado, con su página de control
├─ packages/
│  └─ shared/        Esquemas Zod, estados, permisos y errores: una sola definición para la API y la web
├─ database/         Scripts SQL (la fuente de verdad del esquema)
├─ docs/             Documentación técnica y decisiones (formato OKF)
├─ scripts/          generarEnv.ts: crea el .env con claves aleatorias
├─ Dockerfile        Un archivo con un target por imagen: api, web y webhookMock
└─ docker-compose.yml
```

## Stack

TypeScript en todo el repositorio, en un monorepo de **pnpm**. **Backend:** Node 24, Express 5, Prisma (por introspección, con SQL directo donde Prisma no llega), Zod, JWT con refresh en cookie `HttpOnly`, pino. **Base de datos:** SQL Server 2022. **Frontend:** React 19, Vite, Tailwind 4, shadcn/ui, TanStack Table y Query, React Hook Form. **Pruebas:** Vitest y Supertest. **Contenedores:** Docker Compose y Nginx.

## Documentación

Todo el detalle vive en [`docs/`](docs/index.md): la arquitectura, los 23 ADR, la configuración local, las variables de entorno, el diagnóstico de problemas conocidos y el sistema visual. El README no lo repite.

**Si algo falla al arrancar**, empieza por [troubleshooting.md](docs/03-operacion/troubleshooting.md): cubre los problemas ya vistos (pnpm 12 en Windows, puertos ocupados, variables que faltan en el `.env`, entre otros).

> La edición de SQL Server de la imagen es **Developer**: solo para desarrollo y pruebas. La propuesta para producción está en [deploy.md](docs/03-operacion/deploy.md).
