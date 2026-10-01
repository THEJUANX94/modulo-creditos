---
type: decision
tags: [adr, alcance, multi-entidad, escalabilidad]
---

# ADR 0009: Una sola entidad; multi-entidad como propuesta documentada

## Estado

Aceptado (2026-09-30).

## Contexto

La pregunta de escalabilidad plantea que el sistema pase de 500 a 500.000 créditos mensuales en dos años y que atienda **múltiples entidades cooperativas**. El enunciado aclara que no es necesario implementar toda la arquitectura propuesta: se evalúa la capacidad de identificar los problemas futuros y de justificar las decisiones.

## Decisión

El sistema se implementa para **una sola entidad**. La ruta hacia multi-entidad se documenta en la respuesta de escalabilidad, con estas piezas como punto de partida:

- `entidadId` en las tablas y en el JWT.
- Row-Level Security de SQL Server para aislar los datos de cada entidad.
- Una base de datos propia para las cooperativas grandes.

## Alternativas consideradas

- **Multi-entidad desde ya**: una tabla `Entidades`, `entidadId` como llave foránea en `Asociados` y `Creditos`, la entidad del usuario en el JWT y un filtro en cada consulta. Sería una señal fuerte, pero agrega trabajo en todas las capas y en todas las pruebas.

## Consecuencias

- **Positivas**:
  - El tiempo se invierte en lo que la prueba exige.
  - La propuesta multi-entidad se puede razonar completa en el documento sin cargar el código.
- **Costos aceptados**:
  - Pasar a multi-entidad obligará a agregar `entidadId` a las tablas, los índices y las consultas existentes.

## Por definir en la implementación

- La respuesta de escalabilidad completa (documento pendiente).

Última actualización: 2026-09-30
