---
type: decision
tags: [adr, api, http, errores, logs, health, seguridad, docker]
---

# ADR 0015: Contrato HTTP y base de la API

## Estado

Aceptado (2026-09-30). Implementado en el paso 4a y verificado con la API compilada (bundle de tsup) contra SQL Server en Docker.

## Contexto

El enunciado pide códigos HTTP apropiados y respuestas consistentes, y fija el formato de error `{ "success": false, "error": { "code", "message" } }`. La propuesta de despliegue pide health checks y logs. Antes de construir los módulos de negocio había que fijar la base común: el contrato de las respuestas, el manejo de errores, la configuración, los logs y la operación de la API.

## Decisión

### Contrato de respuestas

1. **Un sobre simétrico al de error.** En éxito, `{ success: true, data }`, y en los listados también `meta: { pagina, tamanoPagina, total, totalPaginas }`. Las llaves del sobre van en inglés, como las del error que fija el enunciado; los campos del dominio, en español.
2. **El error extiende el del enunciado** con `details` (un problema por campo, `{ campo, mensaje }`, que el formulario muestra junto al input) y `requestId`, que el usuario puede reportar y que lleva a los logs. Un 500 nunca expone el stack ni el SQL.

   ```json
   { "success": false,
     "error": { "code": "VALIDACION_FALLIDA", "message": "Hay campos con errores",
                "details": [{ "campo": "valorSolicitado", "mensaje": "Debe ser mayor que 0" }] },
     "requestId": "5f1c…" }
   ```

3. **Códigos de error con su status, en `@creditos/shared`** (`codigosError.ts`). La API los lanza y el frontend decide con ellos qué mostrar: si uno se renombra, falla la compilación en ambos lados.

   | Status | Significado | Códigos |
   |---|---|---|
   | 400 | Entrada mal formada o fuera de rango: corregir el formulario | `VALIDACION_FALLIDA` |
   | 401 | Sin sesión | `NO_AUTENTICADO` |
   | 403 | Rol no autorizado | `SIN_PERMISO` |
   | 404 | No existe | `CREDITO_NOT_FOUND`, `RUTA_NO_ENCONTRADA` |
   | 409 | Choca con el estado actual del recurso: recargar o cambiar de acción | `CREDITO_DUPLICADO`, `CREDITO_NO_EDITABLE`, `CREDITO_NO_ELIMINABLE`, `TRANSICION_INVALIDA`, `CREDITO_MODIFICADO` |
   | 413 | Cuerpo de más de 100 KB | `CUERPO_DEMASIADO_GRANDE` |
   | 422 | Datos bien formados pero inconsistentes: revisar con el usuario | `ASOCIADO_NOMBRE_NO_COINCIDE` |
   | 500 | Inesperado | `ERROR_INTERNO` |
   | 503 | La BD no responde (readiness) | `BD_NO_DISPONIBLE` |

4. **Serialización.** Los montos y la tasa viajan como **string** (`"15000000.00"`, `"1.5000"`), exactos sin importar el tamaño, como hacen las APIs bancarias estrictas. Por dentro se trabaja con `Decimal` y nunca con floats. `version` (`ROWVERSION`) viaja como texto hexadecimal (`"0x00000000000007E1"`): el cliente solo la devuelve.

### Base de la aplicación

5. **Configuración.** Node lee el `.env` de forma nativa (`--env-file-if-exists`), y un esquema Zod (`src/config/config.ts`) valida todas las variables al arrancar. Si falta una o es inválida, la API no arranca y dice cuál. El resto del código usa el objeto tipado `config` y nunca toca `process.env`. Hay **un `.env` por app** (más el de la raíz para el compose), cada uno con su `.env.example`.
6. **requestId.** Un `X-Request-Id` entrante se respeta solo si tiene formato seguro (hasta 100 caracteres alfanuméricos, guion o guion bajo); si no, se genera un UUID. Así nadie puede inyectar saltos de línea en los logs. Se devuelve en el header y en los errores, y se propaga con `AsyncLocalStorage`: el logger lo agrega solo a cada línea.
7. **Logs** (detalle del [ADR 0010](0010-logs-tecnicos-y-auditoria.md)):
   - Una línea por petición con método, ruta, status, duración y requestId. **Nunca los cuerpos.**
   - En la URL, `identificacion` se enmascara (`******4567`) y `busqueda` se redacta.
   - Los 500 se registran con su stack, solo en el log.
   - Timestamps ISO, nivel desde `LOG_LEVEL`. La app siempre emite JSON; `pnpm dev` lo pasa por pino-pretty.
8. **Health checks.**
   - `GET /api/health` (liveness): no toca la BD, así una caída de la BD no hace reiniciar la API.
   - `GET /api/health/ready` (readiness): hace `SELECT 1` y responde 503 si la BD no responde.
9. **Apagado ordenado.** Ante SIGTERM o SIGINT, la API deja de aceptar conexiones, espera las peticiones en curso hasta 10 s y cierra Prisma. Si algo se cuelga, sale a la fuerza.
10. **Seguridad HTTP.**
    - helmet con sus valores por defecto y `x-powered-by` deshabilitado.
    - CORS solo para los orígenes de `CORS_ORIGINS`, con credentials (por la cookie de refresh).
    - JSON con un límite de 100 KB.
    - `trust proxy` desde `TRUST_PROXY`, para que la IP real llegue a la auditoría y al rate limit.
    - Una ruta inexistente responde con el formato estándar (`RUTA_NO_ENCONTRADA`).

### Acceso a datos y entorno de desarrollo

11. **Prisma vive en `apps/api`.** `prisma/schema.prisma` se versiona: es la foto de la introspección y permite generar el cliente sin BD. El cliente se genera en `src/generated/prisma` (git lo ignora) con `prisma generate` en el postinstall. `prisma db pull` usa `DATABASE_ADMIN_URL` (administrador, solo en desarrollo); la app usa `DATABASE_URL` con `appCreditos`.
12. **El SQL directo va en el repository** con plantillas etiquetadas de Prisma (`$queryRaw`): cada `${valor}` viaja como parámetro, sin concatenar texto, y corre dentro de las transacciones de Prisma.
13. **docker-compose de infraestructura desde el paso 4.** `sqlserver` (con volumen) y `dbInit`, que corre `database/inicializar.sh`. El script ejecuta 001 → 003 solo si la BD no existe. Si la encuentra a medias, se detiene y explica cómo recrearla. La clave de `sa` viaja en `SQLCMDPASSWORD`, no en la línea de comandos. El paso 8 agrega la API, el worker, la web y el mock.
14. **Estilo de los módulos.** Cada capa exporta funciones y se importa como espacio de nombres: `import * as healthRepository from './healthRepository'` → `healthRepository.verificarConexion()`.

## Alternativas consideradas

- **Recurso directo** en lugar del sobre, con la paginación en headers: es más REST puro, pero queda asimétrico con el formato de error del enunciado.
- **Error exactamente igual al del enunciado**, sin `details` ni `requestId`.
- **422 para toda validación y regla**: no distingue "corrige el formulario" de "el crédito cambió de estado".
- **Montos como número**: coinciden con el ejemplo del enunciado, pero pierden exactitud por encima de ~9·10¹³.
- **dotenv**, o variables sin validar.
- **requestId siempre generado**: no permite correlacionar con un proxy o el frontend.
- **Registrar los cuerpos enmascarados**: cualquier campo nuevo que no se agregue a la lista se filtra.
- **Un solo `/api/health` con la BD**: una caída de la BD reiniciaría la API sin motivo.
- **Sin CORS (mismo origen)**: impediría usar Swagger u otro cliente desde otro origen.
- **Cliente de Prisma versionado** o un **paquete `packages/db`**.
- **Procedimientos almacenados** o **archivos `.sql`** para el SQL directo.
- **`docker run` manual** para la BD de desarrollo. **Un solo `.env` en la raíz**. **Códigos de error solo en la API**.

## Consecuencias

- **Positivas**:
  - El frontend trata todas las respuestas igual: mira `success` y, si es un error, su `code`.
  - Un error reportado por un usuario se rastrea con su `requestId`.
  - Una configuración incompleta falla al arrancar y no a mitad de una operación.
  - La BD de desarrollo se levanta con un comando, y sobrevive a los reinicios.
- **Costos aceptados**:
  - Los montos como string obligan al frontend a convertir para mostrar y a enviar texto, o a convertir en la entrada (se define con los esquemas de crédito).
  - `prisma db pull` reescribe `schema.prisma` entero: no se puede editar a mano.

## Verificación (2026-09-30)

Con `pnpm -F @creditos/api build` y `node dist/server.js` contra el compose:

| Prueba | Resultado |
|---|---|
| Liveness | 200 `{ success: true, data: { estado: "ok" } }` |
| Readiness con la BD arriba / detenida / levantada de nuevo | 200 / **503 en 27 ms** (liveness sigue en 200) / 200 sin reiniciar la API |
| Ruta inexistente | 404 `RUTA_NO_ENCONTRADA` con `requestId` |
| `X-Request-Id` válido / con salto de línea | Se respeta / se reemplaza por un UUID |
| JSON mal formado / cuerpo de 120 KB | 400 `VALIDACION_FALLIDA` / 413 `CUERPO_DEMASIADO_GRANDE` |
| Cabeceras | CSP, HSTS, nosniff y frameguard presentes, sin `X-Powered-By` |
| CORS | `http://localhost:5173` permitido; otro origen sin `Access-Control-Allow-Origin` |
| Logs | Las 11 líneas de petición llevan `requestId`; `identificacion=******4567`, `busqueda=[REDACTADO]` |
| Configuración inválida | La API no arranca y lista cada variable con su problema |
| `dbInit` | Crea la BD en el primer arranque y no hace nada en el segundo |

**Pendiente de verificar:** el apagado ordenado. Windows no entrega SIGTERM/SIGINT a un proceso que no esté en la misma consola, así que se prueba en el paso 8, con la API en un contenedor Linux.

## Por definir en la implementación

- La traducción de los errores de Zod a `details` (paso 4c).
- Si la entrada acepta montos como número además de string (paso 4c).

Última actualización: 2026-09-30
