---
type: decision
tags: [adr, pruebas, vitest, supertest, sql-server]
---

# ADR 0008: Pruebas con Vitest + Supertest contra un SQL Server real

## Estado

Aceptado (2026-09-30). Implementado en el paso 5 ([ADR 0019](0019-implementacion-de-las-pruebas.md)).

## Contexto

La prueba espera, como mínimo, pruebas automatizadas de creación de crédito, validaciones, consulta de un crédito inexistente, cambio de estado y transiciones inválidas. Recomienda además una prueba que verifique la integración con el webhook.

Parte de las garantías del sistema no está en el código TypeScript: está en las restricciones de la BD y en las transacciones (crédito y evento del outbox en una sola unidad). Un mock de la capa de datos no ejercita nada de eso.

## Decisión

1. **Vitest** como runner.
2. **Pruebas unitarias** para las reglas puras: transiciones de estado y esquemas de validación.
3. **Pruebas de integración HTTP** con **Supertest** contra la app Express, sobre un **SQL Server de pruebas en Docker**.
4. **La prueba del webhook** levanta un servidor HTTP local que responde OK o error, y verifica la traza y los reintentos.

## Alternativas consideradas

- **Jest + Supertest.** El enfoque es el mismo, pero el soporte de TypeScript y ESM necesita más configuración (ts-jest o babel).
- **Solo pruebas unitarias con mocks de la capa de datos.** Son rápidas de montar, pero no prueban las restricciones, las transacciones ni el outbox real.

## Consecuencias

- **Positivas**:
  - Las pruebas pasan por las mismas restricciones y transacciones que producción.
  - La prueba del webhook demuestra el comportamiento ante fallos, que es justo lo que pregunta el enunciado.
- **Costos aceptados**:
  - Las pruebas necesitan Docker con SQL Server en ejecución y son más lentas que las unitarias.
  - Los datos de cada prueba tienen que quedar aislados de los de las demás.

## Por definir en la implementación

- Si el frontend tiene pruebas automatizadas (paso 7).

Resuelto en el [ADR 0019](0019-implementacion-de-las-pruebas.md):

- **La BD de pruebas**: `ModuloCreditosPruebas`, recreada en cada corrida por el `dbInit` del compose con los mismos scripts.
- **La limpieza**: no se limpian datos, porque las tablas de auditoría son inmutables. Cada prueba usa datos únicos y los archivos corren en serie.
- **La cobertura**: un reporte sin umbral.
- **CI**: se documenta con el despliegue (paso 9).

Última actualización: 2026-10-01
