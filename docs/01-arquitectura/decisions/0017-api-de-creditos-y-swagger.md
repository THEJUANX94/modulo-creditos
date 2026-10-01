---
type: decision
tags: [adr, api, creditos, filtros, historial, swagger, openapi]
---

# ADR 0017: API de créditos y documentación Swagger

## Estado

Aceptado (2026-10-01). Implementado en el paso 4c y verificado de punta a punta contra la API compilada: 75 pruebas.

## Contexto

El enunciado fija seis endpoints (crear, listar, consultar, actualizar, cambiar estado y eliminar), pide que el listado soporte como mínimo paginación y filtros por estado e identificación, y valora el ordenamiento y la búsqueda. El frontend necesita además el historial, los totales del dashboard y los catálogos. El enunciado recomienda documentar la API con Swagger y permitir probarla desde ahí.

Las reglas de negocio ya estaban fijadas en el [ADR 0014](0014-reglas-de-negocio.md), los permisos en el [ADR 0016](0016-autenticacion-sesiones-y-permisos.md) y el contrato HTTP en el [ADR 0015](0015-contrato-http-y-base-de-la-api.md).

## Decisión

### Endpoints

Todos exigen autenticación.

| Método y ruta | Permiso | Qué hace |
|---|---|---|
| `GET /api/catalogos` | verCreditos | Tipos de crédito, formas de pago y tipos de identificación **activos**, más los estados, en una sola llamada |
| `GET /api/creditos` | verCreditos | Listado con paginación, filtros, búsqueda y orden |
| `GET /api/creditos/resumen` | verCreditos | `{ total, montoTotal, porEstado: { X: { cantidad, monto } } }`, con los 6 estados aunque estén en cero |
| `GET /api/creditos/{id}` | verCreditos | Detalle, con la `version` para modificarlo |
| `GET /api/creditos/{id}/historial` | verCreditos | Línea de tiempo, **lo más reciente primero** |
| `POST /api/creditos` | crearCredito | 201, con el header `Location` |
| `PATCH /api/creditos/{id}` | editarCredito | Edición **parcial**: solo cambian los campos enviados |
| `PATCH /api/creditos/{id}/estado` | según el estado destino | Cambio de estado |
| `DELETE /api/creditos/{id}` | eliminarCredito | Borrado lógico, con `{ motivo, version }` en el cuerpo |

### Forma de los datos

1. **El crédito sigue el contrato del enunciado, aplanado**: `identificacionAsociado`, `nombreAsociado`, más `tipoIdentificacionAsociado` y `version`. Los montos salen como **string exacto** (`"15000000.00"`, `"1.5000"`).
2. **Los montos se aceptan como número o como string.** El ejemplo del enunciado envía números y funciona tal cual. **Nunca se redondea en silencio**: más de 2 decimales en el valor, o de 4 en la tasa, es un 400. Por dentro se trabaja con `Decimal` y con `CAST(@p AS DECIMAL)` en SQL, nunca con floats.
3. **El nombre del asociado se normaliza**: se quitan los espacios de los extremos y se colapsan los dobles. Así, `"  juan   PEREZ "` coincide con `"Juan Perez"`, porque la comparación la hace la BD con su collation.
4. **`version` viaja en el cuerpo** de la edición, del cambio de estado y del borrado.

### Listado

5. **Filtros**, combinados con AND:
   - `estado`, uno o varios (`?estado=SOLICITADO,EN_ESTUDIO`);
   - `identificacion`, exacta;
   - `tipoCredito` y `formaPago`;
   - `fechaDesde`/`fechaHasta` en formato AAAA-MM-DD, ambos inclusive. Se interpretan como **días calendario en hora de Colombia** y se convierten a UTC (de 05:00 UTC a 05:00 UTC del día siguiente), así un crédito de las 9 p. m. del 31 entra en ese mes.
6. **Búsqueda libre** (`busqueda`, mínimo 2 caracteres): "contiene", en el número de crédito, la identificación y el nombre, sin distinguir mayúsculas ni tildes. **Los comodines de `LIKE` se escapan** (`%`, `_`, `[`), porque Prisma no lo hace en SQL Server.
7. **Orden**: `ordenarPor` toma valores de una lista cerrada (fechaSolicitud, valorSolicitado, numeroCredito, nombreAsociado, estado), con `orden` asc o desc. Por defecto, lo más reciente primero. El consecutivo desempata, así la paginación es estable.
8. **Eliminados**: solo un ADMIN los ve, con `?incluirEliminados=true`. Para cualquier otro rol, 403. El detalle y el historial de un eliminado responden 404, salvo para ADMIN, que los ve con `eliminacion: { fecha, usuarioNombre, motivo }`. Editar, cambiar de estado o eliminar un eliminado responde 404 incluso para ADMIN. Se agregó el permiso `verEliminados` a la matriz.

### Escrituras

9. **Creación, en una transacción**:
   1. Se verifica que el tipo de crédito, la forma de pago y el tipo de identificación existan y estén activos (400 si no).
   2. Se busca el asociado por identificación y tipo: si no existe, se crea; si existe con otro nombre, 422.
   3. Se verifica que no haya duplicado (409).
   4. Se hace el `INSERT … OUTPUT` con SQL directo.
   5. Se escribe la primera fila del historial (NULL → SOLICITADO, con quién lo registró).

   Si dos creaciones chocan en un índice único, se reintenta una vez: el reintento encuentra al asociado ya creado o detecta el crédito duplicado.
10. **Edición**: solo en SOLICITADO (409 `CREDITO_NO_EDITABLE`). Solo se escribe lo que cambia: sin cambios reales responde 200 sin tocar nada, sin auditoría vacía y sin versión nueva. El `motivo` es opcional y queda en las filas de `CambiosCredito` de esa edición, agrupadas por `operacionId`.
11. **Cambio de estado**: las verificaciones van en este orden y la primera que falla define la respuesta:
    1. validación de la entrada (400);
    2. que el crédito exista (404);
    3. que el rol pueda llevarlo a ese estado (403);
    4. que la transición esté permitida (409 `TRANSICION_INVALIDA`);
    5. cuatro ojos (403);
    6. `UPDATE … WHERE version = @version` (409 `CREDITO_MODIFICADO` si no afecta filas).

    Luego se escribe el historial, en la misma transacción. Las denegaciones de rol y de cuatro ojos se registran como `ACCESO_DENEGADO`.
12. **El mapa de transiciones vive en `@creditos/shared`** (`transicionesPermitidas`), y no solo en la API como decía el [ADR 0004](0004-api-modular-por-capas.md). Así el frontend muestra únicamente las acciones válidas, y la regla sigue teniendo una sola fuente.

### Historial

13. Une las dos tablas en una línea de tiempo con tres tipos de entrada: `ESTADO` (estado anterior, nuevo y observación), `EDICION` (los campos de una misma edición, agrupados, con su motivo) y `ELIMINACION` (con su motivo). Cada entrada trae el usuario (`{ id, nombre }`). No se pagina: un crédito tiene pocas decenas de eventos.

### Swagger / OpenAPI

14. **OpenAPI 3.1** generado con `@asteasolutions/zod-to-openapi` desde los mismos esquemas Zod que validan la API. **Las respuestas también tienen esquema Zod** en `@creditos/shared`, y su tipo de TypeScript se deriva de él: lo que documenta Swagger es lo que devuelve la API.
15. **Las descripciones y los ejemplos van en los esquemas con `.meta()`**, que es nativo de Zod 4. Así `@creditos/shared` no depende de la librería de OpenAPI.
16. **Un archivo `*Docs.ts` por módulo**, junto a sus rutas. Cada ruta documenta sus errores posibles, agrupados por status.
17. **Swagger UI en `/api/docs`** y el JSON crudo en `/api/docs/openapi.json`. El botón **Authorize** recibe el accessToken del login. Refresh y logout también funcionan desde Swagger, porque se sirve en el mismo origen que la API y la cookie viaja.
18. **`DOCS_HABILITADA`** (`true` por defecto) lo apaga en un despliegue real, para no publicar el mapa de la API.

## Alternativas consideradas

- **PUT completo**, o PUT y PATCH a la vez.
- **El historial dentro del detalle**: el detalle se vuelve pesado.
- **El resumen solo con cantidades**: se eligió sumar también los montos, aunque el enunciado no lo pide.
- **Un endpoint por catálogo**, o **catálogos fijos en el código**: un valor agregado en la BD no aparecería sin desplegar.
- **Asociado anidado** en la respuesta: se aparta de los nombres de campo del enunciado.
- **Montos solo como string en la entrada**: el ejemplo del enunciado respondería 400.
- **`version` en el header `If-Match`** (412): es el estándar HTTP, pero se aparta de los códigos ya fijados y es menos visible en Swagger.
- **Solo los filtros del enunciado**; **búsqueda "empieza por"** (usa índices, pero no encuentra "pérez" dentro de "Ana María Pérez"); **orden fijo**; **fechas como instantes UTC**.
- **Verificar la versión antes que el rol y la transición**.
- **DELETE con el motivo en la query string**: quedaría en los logs de acceso.
- **Eliminados invisibles incluso para ADMIN**.
- **Transiciones solo en la API**.
- **Un archivo central de OpenAPI**; **OpenAPI 3.0**; **Swagger siempre activo, o solo fuera de producción** (el compose de la demo podría correr en modo producción).

## Consecuencias

- **Positivas**:
  - Cada regla del ADR 0014 tiene su prueba de punta a punta.
  - El evaluador puede probar todo desde Swagger, con el contrato documentado desde la misma fuente que lo valida.
  - Los montos son exactos de punta a punta: nunca pasan por un float.
- **Costos aceptados**:
  - La búsqueda "contiene" recorre la tabla (no usa índices). A 500.000 créditos al mes necesitaría índices de texto completo; está en la propuesta de escalabilidad.
  - El detalle y el listado hacen una consulta extra con SQL directo para leer `version`, que Prisma no soporta.
  - El cliente envía la `version` en cada modificación.

## Verificación (2026-10-01)

**75 pruebas de punta a punta**, todas con el resultado esperado:

- **Catálogos**: 8 tipos de crédito, 4 formas de pago, 5 tipos de identificación y 6 estados.
- **Creación**:
  - el payload exacto del enunciado (201 con `Location`, `numeroCredito`, montos exactos y `version`);
  - montos como string y nombre con otras mayúsculas y espacios;
  - validaciones (valor 0, 3 decimales, negativo, tasa 120, cuotas 0 y 361, CC con letras, tipo inexistente, cuerpo vacío con un detalle por campo);
  - pasaporte alfanumérico y rol sin permiso;
  - nombre distinto (422), duplicado (409) y otro tipo para el mismo asociado (201);
  - **dos creaciones simultáneas del mismo crédito: una 201 y otra 409**.
- **Detalle**: existente, inexistente (404) e id inválido (400).
- **Edición**: parcial con versión nueva, versión vieja (409), sin cambios reales (misma versión), sin campos (400), cambio a un tipo ya en curso (409) y rol sin permiso.
- **Estados**:
  - rol sin permiso (403);
  - transición inválida (409), incluido **RECHAZADO → DESEMBOLSADO, el ejemplo del enunciado**;
  - versión vieja (409);
  - edición y borrado fuera de SOLICITADO (409);
  - observación obligatoria al rechazar y al cancelar;
  - **cuatro ojos**: un ADMIN no aprueba lo que registró ni desembolsa lo que aprobó; otro usuario sí puede.
- **Historial**: orden de lo más reciente a lo más antiguo, la edición agrupada con su motivo y su usuario, y el rechazo con su observación.
- **Eliminación**:
  - sin motivo (400) o con versión vieja (409);
  - invisible para ASESOR, visible para ADMIN con quién y por qué;
  - filtro solo para ADMIN, y el historial muestra la eliminación;
  - eliminar dos veces (404);
  - un eliminado no bloquea un crédito nuevo.
- **Listado**:
  - búsqueda sin tildes (`MARIA perez` encuentra a "Ana María Pérez"), por número, y **`%%` sin efecto de comodín** (encontró el error de Prisma descrito arriba);
  - filtros por identificación, varios estados, tipo, forma y rango de fechas en hora de Colombia;
  - orden y paginación;
  - entradas inválidas (400).
- **Resumen**: el total coincide con el listado, el monto total con la suma de los valores, y la suma por estado con el total.

Además, Swagger UI carga sin errores en el navegador (la CSP de helmet no lo bloquea), y el documento OpenAPI tiene las 16 rutas y los esquemas con nombre.

Última actualización: 2026-10-01
