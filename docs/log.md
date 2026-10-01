---
type: log
tags: [modulo-creditos, changelog]
---

# Bitácora de cambios — Módulo de Créditos

## [0.1.0] - 2026-10-01 — Paso 8: docker-compose del sistema completo

`docker compose up` levanta todo el sistema, con Nginx como única entrada. Decisiones en el [ADR 0022](01-arquitectura/decisions/0022-docker-compose-y-empaquetado.md).

### Added
- `Dockerfile` en la raíz, con targets `api` (la API y el worker), `webhookMock` y `web`. Imágenes base con versión exacta: Node 24.21 sobre Alpine 3.24 y Nginx 1.31 sin privilegios. `.dockerignore`.
- `docker-compose.yml` completo: `sqlserver`, `dbInit`, `usuariosDemo`, `api`, `worker`, `web` y `webhookMock`, con healthchecks, orden de arranque, `stop_grace_period` y logs rotados. SQL Server fijado en 2022-CU27.
  - Los contenedores propios corren con el sistema de archivos de solo lectura, sin capabilities, con `no-new-privileges`, con un usuario sin privilegios y con tini como PID 1.
- `apps/web/nginx/`: el reenvío de `/api`, la caché de los assets, la SPA, gzip y las cabeceras de seguridad con una CSP sin scripts inline.
- `pnpm env:generar` (`scripts/generarEnv.ts`): crea el `.env` de la raíz con claves aleatorias, o le agrega las variables que falten.
- Latido del worker (`/tmp/latidoWorker`), que usa su healthcheck.
- `crearUsuariosDemo` compilado a `dist/` para el servicio `usuariosDemo`.

### Changed
- El script del tema pasa de inline en `index.html` a `apps/web/public/tema.js`, para que la CSP no necesite excepciones.
- `.env.example` de la raíz: las variables del sistema completo.
- `setup-local.md`: la forma rápida con Docker; para desarrollar con pnpm, la infraestructura se levanta con `docker compose up -d sqlserver dbInit`.
- `variables-entorno.md`, `troubleshooting.md` (cuatro entradas nuevas), `architecture.md`, `convenciones.md` (los nombres de Docker) y el índice.
- ADR 0001, 0015, 0018, 0019, 0020 y 0021: sus pendientes del paso 8 pasan a resueltos en el ADR 0022.
- `scripts/` con su propio `tsconfig.json`, incluido en `pnpm typecheck`; `@types/node` en la raíz.

### Fixed
- La imagen de la API pesaba 800 MB: `pnpm deploy --legacy` incluía la CLI de Prisma (con Studio, TypeScript y React), que `@prisma/client` declara como dependencia opcional. Sin `--legacy`, 466 MB.

### Verified
- El apagado ordenado de la API y del worker en Linux, pendiente desde el paso 4: con un envío en curso, el worker registró el `TIMEOUT` y terminó con código 0, y el evento se entregó al volver a levantarlo.

## [0.1.0] - 2026-10-01 — Paso 7: frontend

La interfaz web completa, con el sistema visual de la skill ui-ux-pro-max aplicado. Decisiones en el [ADR 0021](01-arquitectura/decisions/0021-frontend.md).

### Added
- `apps/web`: React 19, Vite 8, Tailwind 4, shadcn/ui (preset Nova, sobre Radix), React Router 8, TanStack Query y Table v9, React Hook Form, Recharts y Sonner. Mismo origen que la API, con el proxy de Vite.
- Pantallas:
  - login y cambio de la contraseña temporal;
  - dashboard: tarjetas, barras por estado y tabla accesible;
  - listado con los filtros en la URL, tabla en escritorio y tarjetas en móvil;
  - crear crédito;
  - detalle con acciones, historial y notificación del webhook;
  - para ADMIN, usuarios y la traza del webhook.
- Cliente HTTP con refresh ante un 401 (compartido entre peticiones), salida por `SESION_INVALIDA` y validación de cada respuesta con los esquemas de `shared`.
- Tema claro, oscuro o del sistema (`lib/tema.tsx`), aplicado antes de pintar.
- 25 pruebas unitarias (proyecto `web` de Vitest, con Testing Library sobre jsdom), sumadas a `pnpm test`.
- `design-system.md`, sección 10: los badges de estado con su contraste, el mapeo a shadcn, la escala, la sombra, las fuentes, el gráfico, los breakpoints y los formatos.

### Changed
- `shared`: la regla "con CC o NIT, solo dígitos" corre con `when` aunque otros campos fallen, para que el formulario la muestre al salir del campo.
- Componentes de shadcn:
  - botones y campos de 40 px, y 44 px en pantallas táctiles;
  - anillo de foco con opacidad completa;
  - botón de peligro sólido;
  - borde de los campos con 3:1;
  - "Close" pasa a "Cerrar".
- `next-themes` se reemplaza por un proveedor propio: React 19 rechaza el `<script>` que inyecta.
- `eslint.config.js`: las reglas de hooks de React en la web, y `components/ui/` tratado como código de terceros.
- ADR 0002, 0008, 0011 y 0012: sus pendientes del frontend pasan a resueltos en el ADR 0021. `architecture.md`, `setup-local.md`, `variables-entorno.md`, `convenciones.md` y `troubleshooting.md`: la web.

### Fixed
- El formulario de crédito mostraba el error de formato de la identificación solo cuando todo lo demás estaba bien: Zod saltaba la regla del objeto mientras otro campo fallara. Lo encontró una prueba del formulario.

### Verificado
- `pnpm test`: 233 de 233. Typecheck, lint, formato y build de producción limpios. La carga inicial es de 324 kB (103 kB gzip), con cada pantalla en su propio archivo.
- Recorrido en el navegador contra la API, el worker y el mock reales:
  - login y sesión recuperada en otra pestaña;
  - el dashboard, y el listado filtrado desde la URL;
  - la creación con el monto exacto;
  - la notificación, que pasó sola de Pendiente a Entregado;
  - un cambio de estado confirmado, y el 403 de los cuatro ojos en un toast;
  - los usuarios y la traza.

### Pendiente
- La revisión visual completa en claro, oscuro y móvil: las capturas fallaron con la ventana de Claude minimizada.

## [0.1.0] - 2026-10-01 — Paso 6: mock del sistema externo

El receptor del webhook que simula el sistema externo, para mostrar en vivo cada respuesta posible. Decisiones en el [ADR 0020](01-arquitectura/decisions/0020-mock-del-sistema-externo.md).

### Added
- `apps/webhookMock` (`node:http`, sin framework). Ante cada `POST /webhooks/creditos`:
  - verifica la firma con la librería oficial `standardwebhooks`, con su ventana de 5 minutos: si falla, 401;
  - valida el contrato con el esquema de `@creditos/shared`: si no lo cumple, 400;
  - deduplica por `webhook-id`: un evento ya procesado responde 200, marcado como duplicado.
- Seis modos: `acepta`, `falla`, `rechaza`, `lento`, `intermitente` y `fallaPrimeros`. `MOCK_MODO` fija el modo al arrancar, y `PUT /control` lo cambia en vivo.
- Rutas:
  - `GET /`: página que se refresca sola, en claro y oscuro, con los colores del design system;
  - `GET /recibidos`: lo mismo en JSON;
  - `GET /salud`.
- Scripts `dev`, `build` y `start` del mock, su `.env.example`, y la fila del mock en `variables-entorno.md`.
- `troubleshooting.md`: el 401 por secretos distintos entre la API y el mock.

### Changed
- ADR 0006 y 0018: sus pendientes del mock pasan a resueltos en el ADR 0020.
- `architecture.md`: el componente del mock. `setup-local.md`: cómo levantar el mock y el orden mock → worker.

### Verificado
- 22 pruebas con procesos reales (mock, worker y API compilados): cada modo cambiado en vivo con su resultado en la traza, el mock detenido y de vuelta, cuerpo alterado, firma de hace 10 minutos, payload fuera del contrato, duplicados, rutas y cuerpo grande (413).
- La página en el navegador, en claro y oscuro, sin errores de consola. Los controles se crean una sola vez, y el refresco no le quita el foco al teclado.

## [0.1.0] - 2026-10-01 — Paso 5: pruebas automatizadas

Las verificaciones de punta a punta de los pasos 4b a 4d pasan a una suite de Vitest contra un SQL Server real. Decisiones en el [ADR 0019](01-arquitectura/decisions/0019-implementacion-de-las-pruebas.md).

### Added
- Vitest 5 con tres proyectos (`vitest.config.ts` en la raíz): `shared` y `api-unitarias`, sin BD, y `api-integracion`, con Supertest contra la BD real. Scripts `pnpm test` y `pnpm test:coverage` (v8, sin umbral).
- `database/recrearBdPruebas.sh`: borra y recrea `ModuloCreditosPruebas` con los mismos scripts. Se niega a tocar una BD cuyo nombre no termine en "Pruebas".
- Setup global de la integración: recrea la BD de pruebas con el `dbInit` del compose y crea un usuario por rol con el script de usuarios demo. La conexión se deriva de `DATABASE_URL`; los secretos son aleatorios en cada corrida.
- 207 pruebas en 14 archivos:
  - unitarias de esquemas, máquina de estados, permisos, contrato del evento, política de reintentos y firma (contra el ejemplo publicado de Standard Webhooks);
  - integración de salud y Swagger, autenticación, usuarios, rate limit, creación, estados, listado, webhook y configuración por proceso.
- Ayudas de las pruebas que validan cada respuesta con los esquemas Zod de Swagger, y un receptor de webhook temporal que verifica la firma y falla a voluntad.
- `troubleshooting.md`: `NOMBRE_BD` en sqlcmd, `-I` en sentencias sueltas, Docker apagado y puertos ocupados al correr las pruebas.

### Changed
- `001`, `002` y `003`: el nombre de la BD llega en `$(NOMBRE_BD)`, y 001 crea el login `appCreditos` solo si no existe. `inicializar.sh` recibe `NOMBRE_BD` (por defecto `ModuloCreditos`) y valida que solo tenga letras y dígitos.
- `tsconfig.json` de `api` y `shared`: incluyen `tests/` y los archivos de configuración. `eslint.config.js`: el `vitest.config.ts` de la raíz usa el proyecto por defecto.
- ADR 0008 y 0012: sus pendientes de pruebas pasan a resueltos en el ADR 0019. ADR 0018: la consulta del reclamo y el hallazgo.
- `setup-local.md`, `convenciones.md` y `variables-entorno.md`: cómo correr las pruebas, sus convenciones y `NOMBRE_BD` en los comandos de sqlcmd.

### Fixed
- **El reclamo del worker bloqueaba filas que no tomaba.** Con dos workers a la vez, uno se quedaba sin eventos (`[10, 0]`): `UPDLOCK` retiene el bloqueo de cada fila leída, y algunos planes leían todos los pendientes antes del `TOP`. El `TOP` ahora va en una subconsulta que solo lee el índice filtrado. No había envíos duplicados, pero los workers no se repartían el trabajo.

### Verificado
- `pnpm test`: 207 de 207, dos corridas seguidas, en ~50 s; cobertura del 88,5 % de sentencias y 82 % de ramas.
- El script de 4d con procesos reales, después de la corrección del reclamo: 51 de 51.
- La BD de desarrollo no cambia con las corridas.

## [0.1.0] - 2026-10-01 — Paso 4d: webhook

El evento `credito.creado` entra al outbox en la transacción de la creación, y un worker lo envía firmado, con reintentos y traza de cada intento. Decisiones en el [ADR 0018](01-arquitectura/decisions/0018-webhook-entrega-firma-y-traza.md).

### Added
- `@creditos/shared`:
  - el contrato del evento (`eventoCreditoCreado.ts`): los campos del enunciado más `tipoIdentificacionAsociado` y `tipoCredito`, con el monto como string;
  - los estados del evento y los resultados de un intento, los filtros de la traza y sus respuestas;
  - el código de error `EVENTO_WEBHOOK_NOT_FOUND` (404).
- `apps/api`, módulo `webhooks`:
  - `registrarCreditoCreado`, que el caso de uso de creación llama dentro de su transacción;
  - el despachador del worker: reclamo atómico con `UPDLOCK, READPAST` y lease de 60 s, envío con `fetch`, firma de Standard Webhooks, `X-Request-Id`, timeout y lectura acotada de la respuesta;
  - la política de reintentos como funciones puras (`politicaReintentos.ts`);
  - `GET /api/webhooks/eventos` y `GET /api/webhooks/eventos/{eventId}`, solo ADMIN;
  - la sección `webhooks` de OpenAPI 3.1 en Swagger.
- `worker.ts`: lectura cada 2 s en lotes de 10 y apagado ordenado con un máximo de 20 s.
- `config/configBase.ts` y `config/configWorker.ts`: cada proceso valida solo sus variables. Variables `WEBHOOK_URL`, `WEBHOOK_SECRETO`, `WEBHOOK_MAX_INTENTOS`, `WEBHOOK_BACKOFF_BASE_MS`, `WEBHOOK_TIMEOUT_MS` y `WEBHOOK_INTERVALO_MS`.
- `troubleshooting.md`: el formato del secreto, los `FALLIDO` sin receptor y los eventos duplicados.

### Changed
- `creditosService.crear` registra el evento en el outbox, en la misma transacción que el crédito.
- `config.ts` queda solo con las variables de la API; el logger y el cliente de Prisma usan `configBase`.
- ADR 0006, 0010 y 0013: sus pendientes del webhook pasan a resueltos en el ADR 0018. El 0013 resuelve también la representación de `version`, ya fijada en el ADR 0015.
- `architecture.md`, `modelo-datos.md`, `variables-entorno.md`, `setup-local.md` y `convenciones.md`: el worker, el lease, las variables por proceso y cómo correr el worker.

### Verificado
- 51 pruebas de punta a punta contra la API y el worker compilados, con un receptor temporal que verifica la firma. Cubren la atomicidad con la creación, cada tipo de falla, el backoff medido, el receptor caído y de vuelta, dos workers sin envíos duplicados, un worker muerto a mitad (el lease devuelve el evento) y la configuración por proceso. Detalle en el ADR 0018.

### Pendiente
- Verificar el apagado ordenado del worker en el contenedor Linux (paso 8): en Windows, `SIGTERM` no pasa por el handler.

## [0.1.0] - 2026-10-01 — Paso 4c: créditos

CRUD de créditos con sus reglas de negocio, historial, resumen, catálogos y Swagger. Decisiones en el [ADR 0017](01-arquitectura/decisions/0017-api-de-creditos-y-swagger.md).

### Added
- `@creditos/shared`:
  - esquemas Zod de entrada de créditos (`esquemasCreditos.ts`): montos como número o string con decimales exactos, identificación según su tipo, edición parcial con `version`, cambio de estado con observación obligatoria al rechazar o cancelar, y filtros del listado;
  - esquemas Zod de respuesta (`respuestasCreditos.ts`): crédito, entrada del historial (estado, edición o eliminación), resumen y catálogos. Los tipos se derivan de ellos;
  - transiciones permitidas y estados en curso (`estadosCredito.ts`), y la acción `verEliminados` (solo ADMIN) en la matriz de permisos.
- `apps/api`, módulo `catalogos`: los tres catálogos activos en una llamada y la verificación de códigos al crear o editar.
- `apps/api`, módulo `creditos`:
  - listar con filtros, búsqueda sin tildes, orden en una lista cerrada y paginación; resumen por estado con cantidades y montos; detalle; historial como línea de tiempo;
  - crear (con el asociado nuevo o existente, en una transacción), editar en `SOLICITADO`, cambiar de estado y eliminar lógicamente con motivo;
  - escrituras de `Creditos` con SQL parametrizado (`$queryRaw` / `$executeRaw`) y concurrencia optimista por `ROWVERSION`.
- Swagger: OpenAPI 3.1 generado desde los esquemas Zod (`@asteasolutions/zod-to-openapi`), un `*Docs.ts` por módulo, UI en `/api/docs` y JSON en `/api/docs/openapi.json`. Variable `DOCS_HABILITADA`.
- `troubleshooting.md`: la BD no disponible (Docker Desktop arrancando) y los comodines de `LIKE` en la búsqueda.

### Changed
- ADR 0004: las transiciones permitidas viven en `shared`, no en el módulo de créditos; sus pendientes pasan a resueltos.
- ADR 0007, 0014 y 0015: Swagger, las reglas pendientes y la entrada de los montos quedan resueltos.
- ADR 0012 y `pnpm-workspace.yaml`: `@scarf/scarf` (telemetría de `swagger-ui-dist`) queda denegado en `allowBuilds`.
- `tiposAuth.ts` y `respuestas.ts` de `shared` pasan de interfaces a esquemas Zod, para que Swagger documente también las respuestas.
- `eslint.config.js`: en los `*Repository.ts`, las claves de objeto quedan libres de formato (relaciones de Prisma, `_count`, llaves compuestas).
- `convenciones.md`: la regla de los `*Docs.ts`. `variables-entorno.md` y `setup-local.md`: `DOCS_HABILITADA` y la URL de Swagger.

### Fixed
- La búsqueda con `%` o `_` devolvía todos los créditos: el `contains` de Prisma no escapa los comodines de `LIKE`. Ahora pasa por `escaparLike`.

### Verificado
- 75 pruebas de punta a punta contra el bundle de producción, entre ellas el payload exacto del enunciado, la creación concurrente (un 201 y un 409), los cuatro ojos en ambos sentidos, la búsqueda con comodines y la coherencia del resumen. Detalle en el ADR 0017.
- Swagger UI carga sin errores de consola con la CSP de helmet.

## [0.1.0] - 2026-10-01 — Paso 4b: autenticación

Login, sesión única, refresh rotativo, permisos, gestión de usuarios y eventos de seguridad. Decisiones en el [ADR 0016](01-arquitectura/decisions/0016-autenticacion-sesiones-y-permisos.md).

### Added
- `002-esquema.sql`: `Usuarios.debeCambiarContrasena` y las tablas `Sesiones` (con el índice único filtrado `UX_Sesiones_activa`, una sesión activa por usuario), `RefreshTokens` (solo el hash) y `EventosSeguridad` (inmutable: trigger + `DENY UPDATE`).
- `@creditos/shared`:
  - roles, estados del crédito y matriz de permisos con las transiciones por rol;
  - esquemas Zod de login, contraseña y usuarios, y la paginación común (20 por defecto, máximo 100);
  - mensajes de Zod en español y los códigos de error de autenticación.
- `apps/api`, módulo `auth`:
  - login, refresh con rotación, gracia de 10 s y detección de reuso, logout, cambio de contraseña y `/me`;
  - middlewares `autenticar()` (verifica la sesión en cada petición) y `autorizar(accion)`;
  - JWT HS256 con jose y contraseñas con Argon2id.
- `apps/api`, módulo `usuarios` (solo ADMIN): listar, crear con contraseña temporal, activar o desactivar y cambiar el rol.
- `apps/api`, código compartido: rate limit (login por IP + correo y por IP, global por IP), header anti-CSRF, `validarEntrada` (Zod → `details`) y el registro de eventos de seguridad.
- Script `usuarios:crear`, que crea los usuarios demo `@creditos.test`. Variables `JWT_SECRET` y `USUARIOS_DEMO_CLAVE`.
- `troubleshooting.md`: el 429 del rate limit en desarrollo y el 401 por sesión reemplazada.

### Changed
- ADR 0005: sus pendientes pasan a resueltos en el ADR 0016, que además cambia la verificación "solo al refrescar" por "en cada petición", por la sesión única.
- ADR 0010: los cambios y su auditoría van en la misma transacción.
- ADR 0013, 0014 y 0015, `modelo-datos.md` y `modelo-datos.dbml`: tablas nuevas, matriz final con cuatro ojos y códigos de error nuevos.
- `server.ts` calcula el hash ficticio del login antes de aceptar peticiones.
- `eslint.config.js`: PascalCase en las claves de objeto solo en los `*Repository.ts` (campos de relación de Prisma).

### Verificado
- 47 pruebas de punta a punta contra el bundle de producción. Detalle en el ADR 0016.
- Tiempo del login con la API caliente: 41 ms con un correo existente frente a 37 ms con uno inexistente.
- `EventosSeguridad` con los tipos esperados y no modificable por la app; nunca hay más de una sesión activa por usuario; los logs llevan `usuarioId` y ningún secreto.

### Pendiente
- Regenerar `diagrams/modelo-datos.png` desde `modelo-datos.dbml`, que ya incluye las tres tablas nuevas.

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
