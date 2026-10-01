---
type: decision
tags: [adr, sql-server, prisma, base-de-datos]
---

# ADR 0003: SQL primero; Prisma genera el cliente por introspección

## Estado

Aceptado (2026-09-30).

## Contexto

La prueba prefiere **Microsoft SQL Server** y evalúa el script SQL. Pide justificar las llaves primarias y foráneas, los índices, los tipos de datos, las restricciones, los campos obligatorios y el manejo de fechas y estados. Además exige no usar `float`/`double` para valores monetarios, sino un tipo como `DECIMAL(18,2)`.

Se eligió **Prisma** para acceder a los datos desde la API. El problema es que `schema.prisma` no puede declarar restricciones `CHECK` (por ejemplo, `valorSolicitado > 0`), que son justamente parte de lo que se evalúa.

## Decisión

1. **El esquema se escribe a mano en SQL**, en `database/`: tablas, llaves, índices y restricciones. Ese script es la fuente de verdad del modelo y es el entregable "Script SQL" de la prueba.
2. **Prisma no gestiona el esquema.** Se ejecuta `prisma db pull` contra la BD ya creada, que genera `schema.prisma` y a partir de él el cliente tipado. No se usa `prisma migrate`.
3. **La base de datos no se limita por las capacidades de Prisma** (decisión del 2026-09-30, al probar Prisma contra el esquema real). SQL Server es un sistema tan robusto como la aplicación: lo que Prisma no soporte (`ROWVERSION`, columnas calculadas, defaults, triggers…) no se quita del esquema, sino que se resuelve con **SQL directo parametrizado** (`$queryRaw` / `$executeRaw`). Prisma se usa donde sirve: lecturas tipadas, relaciones y escrituras de las tablas que soporta por completo.
4. **Prisma 7.10.0** con `@prisma/adapter-mssql` 7.10.0. Prisma 8, al que apunta el tag `latest` de npm (`8.0.0-rc.19`), **todavía no soporta SQL Server**: su documentación lo marca como "Coming soon".

### Qué hace Prisma 7 con este esquema

Verificado el 2026-09-30 contra SQL Server 2022 CU27, con `prisma db pull` + `prisma generate` y operaciones reales conectadas como `appCreditos`:

| Elemento del esquema | Qué hace Prisma | Cómo se resuelve |
|---|---|---|
| `ROWVERSION` (`Creditos.version`) | Lo marca `Unsupported("timestamp")`. Como es obligatorio, **no genera `create` para `Creditos`**, no se puede filtrar por él y no aparece en las lecturas | **Todas las escrituras de `Creditos`** (crear, editar, cambiar estado, borrar) van con SQL parametrizado: `INSERT … OUTPUT` y `UPDATE … WHERE version = @version`. Verificado: con la versión vigente afecta 1 fila; con la vieja, 0 |
| Columna calculada `numeroCredito` | La trata como un campo normal y obligatorio | Se resuelve sola, porque el `INSERT` lo escribe el SQL directo y nunca envía esa columna. Las lecturas con Prisma sí la devuelven |
| `DEFAULT (N'...')` | Lo lee como el texto literal `"N'PENDIENTE'"` y **lo inserta tal cual** si no se envía el campo (lo rechaza el `CHECK`) | La app no depende de esos defaults en Prisma: envía el valor explícito o inserta con SQL. El SQL se queda con el literal Unicode correcto |
| `DEFAULT` con expresiones complejas | También los lee como texto literal | Mismo criterio |
| Índices filtrados | Los reconoce, con el preview feature `partialIndexes` que agrega `db pull` | Pero expone `UX_Creditos_enCurso` como llave única de `findUnique` (`asociadoId_tipoCredito`), cuando solo es única entre los créditos en curso. **No se debe usar**: se consulta con `findFirst` y el filtro de estados |
| Triggers `INSTEAD OF UPDATE, DELETE` | `create` y `createMany` funcionan sin problema con el `OUTPUT` | — |
| `CHECK` | No los representa | La BD los hace cumplir |
| `UNIQUEIDENTIFIER` con `NEWID()` | `@default(dbgenerated("newid()"))` | — |

## Alternativas consideradas

- **`schema.prisma` + `prisma migrate`.** El modelo se declara en Prisma y las migraciones se generan solas. Los `CHECK` y los índices especiales habría que agregarlos a mano al `migration.sql`. El SQL lo produce la herramienta, así que es menos propio para defender.
- **Driver `mssql` + SQL propio.** El SQL queda completamente a la vista, pero no hay cliente tipado y hay más código de mapeo.
- **TypeORM.** Usa entidades con decoradores. Su soporte de SQL Server es aceptable, con particularidades en `DECIMAL` y en las migraciones.
- **Knex.** Un query builder con migraciones versionadas en TypeScript, sin ORM.

## Consecuencias

- **Positivas**:
  - El modelo de datos se lee y se defiende directamente en SQL, con todas sus restricciones.
  - El cliente tipado sale del esquema real. Cuando el script cambia, `db pull` + `prisma generate` actualizan los tipos.
- **Costos aceptados**:
  - Prisma no versiona migraciones: los cambios de esquema se aplican con scripts y después hay que repetir la introspección.
  - Prisma no conoce los `CHECK`. La BD los hace cumplir, pero los tipos generados no los reflejan, así que las validaciones de entrada no pueden apoyarse en el cliente para esas reglas.
  - Las columnas `DECIMAL` llegan a TypeScript como `Prisma.Decimal`, no como `number`, y hay que decidir cómo se serializan en las respuestas JSON.
  - La tabla principal, `Creditos`, se escribe con SQL parametrizado y no con el cliente tipado. Esas consultas se concentran en el repository y se cubren con pruebas de integración contra la BD real.

## Por definir en la implementación

Resuelto en el [ADR 0015](0015-contrato-http-y-base-de-la-api.md): Prisma vive en `apps/api` (schema versionado, cliente generado e ignorado por git), el SQL directo va en el repository con `$queryRaw`, los montos viajan como string y `version` en hexadecimal.

Resuelto: el modelo de datos completo y la organización de `database/` están en el [ADR 0013](0013-modelo-de-datos.md).

Última actualización: 2026-09-30
