---
type: decision
tags: [adr, base-de-datos, sql-server, modelo, uuid, auditoria]
---

# ADR 0013: Modelo de datos

## Estado

Aceptado (2026-09-30). Verificado contra SQL Server 2022 CU27 en un contenedor temporal.

## Contexto

El enunciado pide como mínimo una tabla `Creditos`, valora un modelo con `Asociados`, `Creditos` e `HistorialCredito`, y exige justificar las llaves primarias y foráneas, los índices, los tipos de datos, las restricciones, los campos obligatorios y el manejo de fechas y estados. Prohíbe `float`/`double` para dinero.

Antes de este ADR ya estaban decididos el SQL escrito a mano como fuente de verdad ([ADR 0003](0003-sql-primero-prisma-por-introspeccion.md)), el outbox ([ADR 0006](0006-webhook-outbox-transaccional.md)) y la auditoría inmutable ([ADR 0010](0010-logs-tecnicos-y-auditoria.md)).

El diccionario completo, tabla por tabla, está en [modelo-datos.md](../modelo-datos.md). Las reglas de negocio están en el [ADR 0014](0014-reglas-de-negocio.md).

## Decisión

### Infraestructura

1. **SQL Server 2022** (imagen `mssql/server:2022-latest`, edición Developer para desarrollo).
2. **Base `ModuloCreditos`, esquema `dbo`, collation `Modern_Spanish_CI_AI`**: no distingue mayúsculas ni tildes ("perez" encuentra "Pérez") y ordena según el alfabeto español.
3. **Scripts numerados en `database/`, ejecutados una vez sobre una BD vacía**:
   - `001-crearBaseDatos.sql`: la BD y el login de la app.
   - `002-esquema.sql`: tablas, restricciones, índices, triggers y permisos, en una sola transacción.
   - `003-catalogos.sql`: los datos obligatorios.

   Se ejecutan con `sqlcmd -f 65001` (archivos UTF-8). La contraseña del login de la app llega como variable de sqlcmd (`$(APP_DB_PASSWORD)`) y nunca se escribe en el repositorio.

### Entidades

4. **`Asociados` es una tabla propia**, con FK desde `Creditos`. La API sigue recibiendo y devolviendo `identificacionAsociado` y `nombreAsociado`.
5. **Tipo de identificación**, con CC por defecto: CC, CE, PA, PPT y NIT. La unicidad real es tipo + número, y el formato depende del tipo: CC y NIT solo dígitos (el NIT sin dígito de verificación), y CE, PA y PPT alfanuméricos. **Extiende el contrato del enunciado** con un campo opcional.
6. **Catálogos como tablas con el código como PK** (`TiposIdentificacion`, `TiposCredito`, `FormasPago`, `Roles`), con una columna `activo` para retirar valores sin borrarlos. **El estado no es tabla, es un `CHECK`**: está atado a la máquina de estados del código, y un estado nuevo exige código de todos modos.
7. **Usuarios** inician sesión con su correo. En el paso de autenticación se agregaron `debeCambiarContrasena` y las tablas `Sesiones` (con una sola sesión activa por usuario, garantizada por un índice único filtrado), `RefreshTokens` (solo el hash SHA-256) y `EventosSeguridad` (inmutable). Ver el [ADR 0016](0016-autenticacion-sesiones-y-permisos.md).

### Llaves

8. **Esquema híbrido en `Usuarios`, `Asociados` y `Creditos`.** `id UNIQUEIDENTIFIER DEFAULT NEWID()` es la PK **nonclustered** y el identificador público (API, webhook y FKs). `consecutivo INT IDENTITY` es el índice **clustered**.
   - El UUID aleatorio no se puede adivinar ni enumerar.
   - El consecutivo creciente evita los *page splits* y la fragmentación que causaría un UUID como clave clustered.
   - Los índices secundarios cargan 4 bytes de clave clustered en lugar de 16.
9. **`BIGINT IDENTITY`** en las tablas internas que crecen varias filas por crédito: historial, cambios, outbox e intentos.
10. **`numeroCredito` es una columna calculada `PERSISTED` y `UNIQUE`**: `CR-{año de la solicitud en hora de Colombia}-{consecutivo con 6 dígitos}`. El año se calcula con `DATEADD(HOUR, -5, …)`, que es exacto y determinista porque Colombia no tiene horario de verano. No hay concurrencia que resolver.

### Tipos

11. **Dinero en `DECIMAL(18,2)`**, como exige el enunciado.
12. **`tasaInteres` en `DECIMAL(6,4)`, como porcentaje mensual** (1.5000 = 1,5 % mes vencido).
13. **`numeroCuotas` en `SMALLINT`.**
14. **Fechas en `DATETIME2(3)` en UTC**, que pone el servidor (`SYSUTCDATETIME()`). La API las devuelve en ISO 8601 con `Z`.
15. **Todo el texto en `NVARCHAR`.**

### Auditoría, outbox y seguridad

16. **El historial está en dos tablas**:
    - `HistorialCredito` guarda los cambios de estado, con las columnas del enunciado más un requestId. La creación es su primera fila: NULL → SOLICITADO.
    - `CambiosCredito` guarda los cambios de datos, una fila por campo, agrupadas por `operacionId`. El borrado lógico también va aquí.
17. **Inmutabilidad en dos capas** para `HistorialCredito`, `CambiosCredito`, `WebhookIntentos` y `EventosSeguridad`:
    - el login de la app tiene `DENY UPDATE` y ningún permiso de `DELETE`;
    - un trigger `INSTEAD OF UPDATE, DELETE` lanza un error incluso a un administrador.
18. **Login de la app con mínimo privilegio (`appCreditos`)**: `SELECT`, `INSERT` y `UPDATE` sobre `dbo`, y **ningún `DELETE` en ninguna tabla**, porque todo borrado es lógico. Además tiene `DENY UPDATE` por columna sobre `Creditos (asociadoId, fechaSolicitud)`.
19. **El outbox guarda un snapshot del payload** (JSON validado con `ISJSON`) y el `eventId` que genera la API. La traza de cada envío va en `WebhookIntentos`.

## Alternativas consideradas

- **SQL Server 2025**: trae un tipo `json` nativo, pero Prisma no lo menciona.
- **Esquema `creditos`**: obliga a configurar varios esquemas en Prisma.
- **Collations `Modern_Spanish_CI_AS` o `SQL_Latin1_General_CP1_CI_AS`**: con ellas, buscar sin tilde no encuentra el nombre con tilde.
- **Scripts idempotentes**: son más robustos para reaplicar, pero menos legibles. **Un solo script**: mezcla estructura y datos.
- **Solo la tabla `Creditos`**, con el nombre del asociado repetido en cada crédito.
- **Usar el nombre registrado o actualizarlo** cuando el nombre enviado no coincide (ver el [ADR 0014](0014-reglas-de-negocio.md)).
- **Todo con `CHECK`**: agregar un tipo de crédito exigiría cambiar el esquema. **Todo en tablas**, incluidas las transiciones: la regla quedaría duplicada en la BD y en el código.
- **Solo número de identificación, sin tipo**: respeta el contrato, pero la unicidad no es la real.
- **PK `INT`**: sus ids son enumerables. **UUID secuencial** (`NEWSEQUENTIALID`): adivinable. **UUID aleatorio o v7 como clave clustered**: fragmenta, porque SQL Server ordena un `UNIQUEIDENTIFIER` empezando por sus últimos 6 bytes. **GUID COMB**: requiere un generador no estándar.
- **Consecutivo anual sin saltos**: serializa las creaciones. **`SEQUENCE` global**: también tiene saltos.
- **`DATETIMEOFFSET`** u **hora local de Colombia** para las fechas.
- **`VARCHAR` para los códigos**: se expone a conversiones implícitas con los parámetros `NVARCHAR` que envía el driver.
- **Una sola tabla de historial** con `tipoEvento` y los cambios en JSON.
- **Solo permisos o solo triggers** para la inmutabilidad.
- **Payload armado al momento del envío** en lugar de snapshot.

## Consecuencias

- **Positivas**:
  - Cada regla estructural la garantiza la BD, aunque falle el código: duplicados, formatos, rangos, obligatoriedad de motivos, inmutabilidad y ausencia de borrados físicos. Se verificó con 35 casos ejecutados como `appCreditos`, más los triggers probados como `sa`.
  - Los identificadores públicos no se pueden enumerar, y las inserciones siguen siendo secuenciales.
  - El historial responde quién, qué, cuándo y por qué.
- **Costos aceptados**:
  - **El consecutivo tiene saltos**: un `INSERT` fallido consume un valor del `IDENTITY` (en las pruebas, `numeroCredito` saltó varias posiciones tras los casos rechazados). Es aceptable para un número de crédito, que no es una factura.
  - Dos columnas de identidad por entidad, que hay que explicar.
  - **Agregar un tipo de identificación exige actualizar `CK_Asociados_identificacion`** con su regla de formato.
  - **Prisma 7 no soporta parte del esquema** (`ROWVERSION`, columnas calculadas y los `DEFAULT` con `N'...'`). Esas operaciones van con SQL directo, por decisión: el esquema no se recorta para acomodar al ORM. Ver el [ADR 0003](0003-sql-primero-prisma-por-introspeccion.md).

## Por definir en la implementación

Resuelto en el [ADR 0018](0018-webhook-entrega-firma-y-traza.md): el worker reclama los eventos con un `UPDATE` atómico (`UPDLOCK, READPAST`) y un lease sobre `proximoIntento`, **sin columnas nuevas**. `intentos` se incrementa al reclamar y es el `numeroIntento` del envío en curso.

Resuelto en el [ADR 0015](0015-contrato-http-y-base-de-la-api.md): `version` viaja como texto hexadecimal (`"0x00000000000007E1"`).

Última actualización: 2026-10-01
