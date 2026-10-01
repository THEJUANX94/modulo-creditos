---
type: decision
tags: [adr, api, express, arquitectura, reglas-de-negocio]
---

# ADR 0004: API modular por capas; las reglas de negocio viven en el service

## Estado

Aceptado (2026-09-30).

## Contexto

La prueba pide que el candidato **explique dónde implementó las reglas de negocio y por qué**. Las reglas mínimas son `valorSolicitado > 0`, `tasaInteres >= 0`, `numeroCuotas > 0`, el control de créditos duplicados y el control de transiciones de estado (por ejemplo, un crédito no pasa directamente de `RECHAZADO` a `DESEMBOLSADO`).

La API tiene pocos dominios (créditos, asociados, autenticación y webhooks), y el tiempo recomendado es de 8 a 12 horas.

## Decisión

Un módulo por dominio, y dentro de cada módulo cuatro capas con responsabilidades separadas:

```
apps/api/src/
├─ modules/
│  ├─ creditos/
│  │  ├─ creditosRoutes.ts        rutas y middlewares (autenticación, validación)
│  │  ├─ creditosController.ts    traduce HTTP ↔ service
│  │  ├─ creditosService.ts       reglas de negocio y transacciones
│  │  ├─ creditosRepository.ts    acceso a datos
│  │  └─ estadoTransiciones.ts    transiciones de estado permitidas
│  ├─ asociados/
│  ├─ webhooks/
│  └─ auth/
├─ shared/       errores, middlewares, cliente de BD, logger
├─ config/
├─ app.ts
├─ server.ts     arranque de la API
└─ worker.ts     arranque del worker del outbox (ver ADR 0006)
```

| Capa | Hace | No hace |
|---|---|---|
| routes | Declara método, ruta y middlewares | Lógica |
| controller | Lee la petición, llama al service y arma la respuesta HTTP | Reglas de negocio |
| service | Aplica las reglas de negocio y abre las transacciones | Conocer Express |
| repository | Ejecuta las consultas a la BD | Reglas de negocio |

Las transiciones permitidas viven en `estadoTransiciones.ts`, aparte del service, para que se puedan leer y probar por sí solas.

## Alternativas consideradas

- **Hexagonal / Clean.** Separa dominio, casos de uso e infraestructura con puertos y adaptadores. Es más robusta y desacoplada, pero tiene más archivos y más ceremonia para el tamaño y el tiempo de la prueba.
- **Capas globales** (`controllers/`, `services/`, `repositories/` en la raíz). Es habitual en Express, pero mezcla los dominios a medida que el proyecto crece.

## Consecuencias

- **Positivas**:
  - Cada dominio tiene sus reglas en un solo lugar, el service, que no depende de HTTP. Eso es lo que se explica en la socialización.
  - Las transiciones de estado se prueban de forma unitaria, sin levantar la API ni la BD.
  - Cada carpeta de `modules/` agrupa un dominio completo, así que el código se navega por dominio y no por tipo de archivo.
- **Costos aceptados**:
  - Hay menos aislamiento que en hexagonal: el service usa el repository concreto, sin interfaces de por medio.

## Por definir en la implementación

- Qué validaciones viven en los esquemas Zod (forma y rangos) y cuáles en el service (duplicados, transiciones).
- El formato de las respuestas exitosas. El de error lo fija el enunciado: `{ "success": false, "error": { "code", "message" } }`.

Resuelto en el [ADR 0014](0014-reglas-de-negocio.md): la regla de duplicados y el mapa de transiciones. Las reglas que se pueden expresar como restricción se repiten en la BD como defensa en profundidad (tabla "Dónde vive cada regla").

Última actualización: 2026-09-30
