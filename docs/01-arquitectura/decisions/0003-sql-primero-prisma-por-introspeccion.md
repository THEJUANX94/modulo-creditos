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

## Por definir en la implementación

- El modelo de datos completo: tablas, llaves, índices, tipos y restricciones.
- La organización de `database/`: un solo script o varios numerados.
- La versión de Prisma y el driver o adaptador para SQL Server. Ojo: al 2026-09-30, el tag `latest` de npm apunta a `8.0.0-rc.19` (release candidate); la última estable es la 7.10.0, con `@prisma/adapter-mssql` 7.10.0.
- La serialización de los valores `DECIMAL` en la API (number o string).

Última actualización: 2026-09-30
