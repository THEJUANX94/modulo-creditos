---
type: decision
tags: [adr, pruebas, vitest, supertest, sql-server, cobertura]
---

# ADR 0019: Implementación de las pruebas automatizadas

## Estado

Aceptado (2026-10-01). Implementado en el paso 5: 207 pruebas en 14 archivos, todas en verde.

## Contexto

El [ADR 0008](0008-pruebas-vitest-supertest-bd-real.md) fijó la estrategia: Vitest y Supertest contra un SQL Server real. Quedaban por definir:

- la BD de pruebas y cómo se crea;
- cómo se aíslan los datos;
- el alcance;
- la cobertura y la ejecución en CI.

Dos rasgos del sistema condicionan el aislamiento:

- **Las tablas de auditoría son inmutables** (`DENY UPDATE` y triggers que bloquean el `DELETE`). Los datos no se pueden limpiar entre pruebas.
- **Hay una sola sesión por usuario y un solo outbox.** Dos pruebas en paralelo con el mismo usuario se cerrarían la sesión entre sí. Un worker de desarrollo que use la misma BD se llevaría los eventos de las pruebas.

Las verificaciones de punta a punta de los pasos 4b a 4d (scripts sueltos contra la API compilada) dejaban la evidencia fuera del repositorio.

## Decisión

### Base de datos

- **Una BD aparte, `ModuloCreditosPruebas`**, en el mismo SQL Server del compose, **recreada en cada corrida**.
  - Se crea con los mismos scripts 001 → 003, ahora parametrizados con `$(NOMBRE_BD)`. Así, las pruebas verifican también los scripts.
  - El login `appCreditos` es del servidor: 001 lo crea solo si no existe, y las dos BD lo comparten.
- **La crea el `dbInit` del compose.** El setup global de Vitest corre `docker compose run --rm dbInit` con `database/recrearBdPruebas.sh`, que borra la BD de pruebas y llama a `inicializar.sh`. Es el mismo sqlcmd que en desarrollo.
  - El script se niega a borrar una BD cuyo nombre no termine en "Pruebas": nunca toca `ModuloCreditos`.
  - `inicializar.sh` valida que el nombre tenga solo letras y dígitos, porque se inserta en el SQL.
- **La conexión se deriva de `DATABASE_URL`**, cambiando solo el nombre de la BD: mismo servidor y mismo login de mínimo privilegio. No hay nada nuevo que configurar.
- **Los usuarios de prueba** (uno por rol) se crean con el mismo script de los usuarios demo (`usuarios:crear`), con una contraseña aleatoria en cada corrida. `JWT_SECRET` y `WEBHOOK_SECRETO` también son aleatorios.

### Aislamiento

- **Los archivos de integración corren en serie** (`fileParallelism: false`).
- **Cada prueba usa sus propios datos**: identificaciones aleatorias.
- **Los totales se comparan como diferencias**, o contra el listado completo, nunca contra un número fijo.
- **Cada archivo carga su propia app**, con su propio rate limit en memoria, y cierra su cliente de Prisma al terminar.

### Organización

| Proyecto de Vitest | Dónde | Qué prueba | Necesita |
|---|---|---|---|
| `shared` | `packages/shared/tests/` | Esquemas Zod, máquina de estados, permisos y el contrato del evento | Nada |
| `api-unitarias` | `apps/api/tests/unitarias/` | Política de reintentos y firma del webhook | Nada |
| `api-integracion` | `apps/api/tests/integracion/` | La API por HTTP (Supertest), el worker y la configuración por proceso | Docker con SQL Server |

- **Un `vitest.config.ts` en la raíz** declara los tres proyectos: `pnpm test` corre todo.
- **Las unitarias se pueden correr sin Docker**: `pnpm vitest run --project shared --project api-unitarias`.

### Alcance: las verificaciones de 4b a 4d pasan a la suite

| Archivo | Cubre |
|---|---|
| `salud` | Liveness, readiness, requestId, 404 y el documento OpenAPI (rutas y sección `webhooks`) |
| `auth` | Login fallido con tiempo similar, cookie, token manipulado, vencido y sin firma, refresh con CSRF, rotación, gracia y reuso, sesión única, logout y eventos de seguridad |
| `usuarios` | Gestión de usuarios, contraseña temporal, cambio de rol y desactivación que cortan la sesión |
| `limiteLogin` | 5 fallos por cuenta y 20 intentos por IP |
| `creditosCreacion` | **Mínimos del enunciado**: creación (el payload exacto), validaciones y consulta inexistente. Además, duplicados, asociado con otro nombre y creación concurrente |
| `creditosEstados` | **Mínimos del enunciado**: cambio de estado y transiciones inválidas (incluida RECHAZADO → DESEMBOLSADO). Además, edición con versión, cuatro ojos, historial y eliminación lógica |
| `creditosListado` | Filtros, búsqueda sin tildes ni comodines, orden, paginación y resumen |
| `webhook` | **La integración con el webhook, que el enunciado recomienda probar**: atomicidad con la creación, contrato y firma, cada tipo de falla, backoff medido, receptor caído, dos workers, lease vencido y logs |
| `configProcesos` | Cada proceso exige solo sus variables (procesos reales con `node --import tsx`) |

- **Las respuestas se leen validándolas con los esquemas Zod que publica Swagger.** Cada prueba verifica también el contrato, no solo los datos.
- **El worker corre dentro de la prueba** (`procesarLote()`) contra un receptor HTTP temporal que verifica la firma y responde según un escenario por asociado. Se usan valores cortos: 4 intentos, base de 100 ms y timeout de 1 s.
- **Lo que en 4d exigía matar procesos se simula:**
  - el lease vencido, moviendo `proximoIntento` en vez de esperar 60 s;
  - un worker muerto, reclamando el evento sin enviarlo;
  - dos workers, con dos `procesarLote()` simultáneos.
- **Los procesos de configuración apuntan a una BD inalcanzable**: un worker que alcance a arrancar no toca el outbox de las pruebas.

### Cobertura y CI

- **`pnpm test:coverage` genera un reporte** (v8; texto y HTML en `coverage/`), **sin umbral**. Un porcentaje global premia probar lo fácil; la suite se defiende por las reglas que cubre (tabla anterior).
- **CI**: se documenta en la propuesta de despliegue (paso 9), no se configura ahora.

## Hallazgo: el reclamo bloqueaba de más

La prueba de dos workers simultáneos encontró un defecto del [ADR 0018](0018-webhook-entrega-firma-y-traza.md) que los scripts de 4d no habían detectado.

- **Síntoma.** Dos reclamos sobre 20 eventos listos tomaban `[10, 0]`, a veces `[2, 10]`.
- **Causa.** `UPDLOCK` retiene el bloqueo de **cada fila que lee** hasta el final de la sentencia. SQL Server elegía, según el caso, planes que leían todos los pendientes antes de aplicar el `TOP`: un `Sort`, o búsquedas por la clave del índice clustered. Así bloqueaba filas que no iba a tomar, y `READPAST` hacía que la otra réplica las saltara todas.
- **Impacto.** Nunca se enviaba un evento dos veces, pero dos workers no se repartían el trabajo.
- **Corrección.** El `TOP` va en una subconsulta que solo lee el índice filtrado, ya ordenado y con el `id`. El `UPDATE` exterior toca solo esos ids, así que cada reclamo bloquea exactamente las filas que toma.
- **Verificación.** 5 de 5 corridas con `[10, 10]` y 20 eventos distintos; la suite completa dos veces seguidas; y el script de 4d con procesos reales: 51 de 51.

## Alternativas consideradas

- **Un contenedor de SQL Server aparte para las pruebas**: aislamiento total y sin tocar los scripts, pero cada corrida espera unos 30 s a que arranque y ocupa otros ~2 GB de RAM.
- **La misma BD de desarrollo**: ensucia los datos, impide totales exactos, y un worker de desarrollo se llevaría los eventos.
- **Crear la BD desde Node** partiendo los `.sql` por `GO`: reimplementa una parte de sqlcmd y no prueba `inicializar.sh`.
- **Un `.env.test` propio**: es otro archivo que copiar, con la misma clave del login.
- **Archivos en paralelo con usuarios por archivo**: más rápido, pero el outbox es uno solo y los totales se vuelven frágiles.
- **Solo los mínimos del enunciado**, o los mínimos más lo diferencial: lo demás quedaría verificado solo en los ADR.
- **Pruebas junto al código** (`*.test.ts` en `src/`): mezcla producción y pruebas.
- **Umbral de cobertura del 80 %**, o sin cobertura.
- **GitHub Actions ahora**: se documenta con el despliegue.
- **Leer las respuestas sin validarlas**: el contrato de Swagger podría desviarse sin que ninguna prueba lo note.

## Consecuencias

- **Positivas**:
  - Cada regla de negocio, de seguridad y del webhook tiene una prueba que corre con un comando, contra la BD real.
  - Las pruebas verifican también los scripts SQL, el script de usuarios y el contrato de Swagger.
  - La suite ya encontró un defecto de concurrencia que las pruebas manuales no habían visto.
- **Costos aceptados**:
  - La integración necesita Docker con SQL Server arriba, y tarda unos 50 s (la BD se recrea en ~3 s).
  - Los scripts SQL exigen `-v NOMBRE_BD=…` al correrlos a mano.
  - El receptor de las pruebas usa el puerto 4100, y el proceso de configuración el 3998: tienen que estar libres.
  - El apagado ordenado del worker sigue sin prueba automatizada: en Windows, `SIGTERM` no pasa por el handler. Se verifica en el contenedor Linux (paso 8).

## Verificación (2026-10-01)

- **207 pruebas en 14 archivos.** Las unitarias (99) corren en ~3 s y las de integración (108) en ~45 s. Dos corridas completas seguidas, todas en verde.
- **Cobertura:** 88,5 % de sentencias, 82 % de ramas, 91,5 % de funciones y 90,5 % de líneas. No cuenta lo que corre en procesos aparte (`worker.ts`, `server.ts` y la validación de configuración).
- **La BD de desarrollo no se toca**: tras las corridas, `ModuloCreditos` conserva sus créditos, y el script de recreación rechaza ese nombre.

Última actualización: 2026-10-01
