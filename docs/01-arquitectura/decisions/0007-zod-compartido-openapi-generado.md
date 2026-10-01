---
type: decision
tags: [adr, validacion, zod, openapi, swagger]
---

# ADR 0007: Esquemas Zod compartidos y OpenAPI generado a partir de ellos

## Estado

Aceptado (2026-09-30).

## Contexto

Las mismas reglas de entrada (campos obligatorios, rangos y formatos) se necesitan en tres lugares:

- en la API, para validar;
- en el formulario de React, para avisar al usuario;
- en Swagger, para documentarlas.

Si se escriben tres veces, se desincronizan. La prueba recomienda además documentar la API con Swagger/OpenAPI y permitir probar los endpoints desde la documentación.

## Decisión

1. **Un esquema Zod por operación** (crear crédito, actualizar, cambiar estado, filtros de consulta…) en `@creditos/shared`.
2. **La API los usa en un middleware de validación** y **el frontend en sus formularios**, con los mismos mensajes. Los tipos de TypeScript se infieren de los esquemas.
3. **El documento OpenAPI se genera desde esos esquemas** con `@asteasolutions/zod-to-openapi`, y `swagger-ui-express` lo sirve en `/api/docs`.

## Alternativas consideradas

- **class-validator + DTOs**, con clases y decoradores al estilo NestJS. No se comparte bien con React y requiere `reflect-metadata`.
- **Joi.** Es maduro, pero no infiere tipos de TypeScript y es pesado para el navegador.
- **`openapi.yaml` escrito a mano.** Da control total del texto, pero se desincroniza de la validación real.
- **Comentarios JSDoc con `swagger-jsdoc`.** Es el estilo clásico de Express, pero duplica los esquemas en comentarios.

## Consecuencias

- **Positivas**:
  - Un cambio en una regla de entrada se refleja a la vez en la API, el formulario y la documentación.
  - Swagger documenta lo que la API valida de verdad.
- **Costos aceptados**:
  - Cada ruta tiene que registrarse también en el registro de OpenAPI, un paso extra por endpoint.
  - El proyecto depende de que las versiones de Zod y de `zod-to-openapi` sean compatibles.

## Por definir en la implementación

- La versión de Zod.
- La integración con los formularios del frontend.
- Cómo se traduce un error de Zod al formato de error del enunciado, y con qué código HTTP (400 o 422).
- La autenticación desde Swagger UI, para probar los endpoints protegidos.

Última actualización: 2026-09-30
