---
type: decision
tags: [adr, reglas-de-negocio, estados, duplicados, inmutabilidad, concurrencia]
---

# ADR 0014: Reglas de negocio del crédito

## Estado

Aceptado (2026-09-30). Las restricciones de la BD se verificaron contra SQL Server 2022. Las del service se implementan en el paso de la API.

## Contexto

El enunciado fija `valorSolicitado > 0`, `tasaInteres >= 0` y `numeroCuotas > 0`. Deja al candidato el control de duplicados y el de transiciones (un crédito no pasa de RECHAZADO a DESEMBOLSADO), y pide **explicar dónde se implementó cada regla y por qué**. Pide además decir qué información es modificable y cuál inmutable en un sistema financiero.

El [ADR 0004](0004-api-modular-por-capas.md) ubicó las reglas en el service de cada módulo. Este ADR fija cuáles son y qué parte de cada una garantiza también la BD ([ADR 0013](0013-modelo-de-datos.md)).

## Decisión

### 1. Transiciones de estado

Flujo lineal estricto, con rechazo directo desde SOLICITADO:

```
SOLICITADO ──► EN_ESTUDIO ──► APROBADO ──► DESEMBOLSADO
     │              │             │
     ├──► RECHAZADO ◄┘             │
     │                            │
     └──► CANCELADO ◄── (desde SOLICITADO, EN_ESTUDIO y APROBADO)
```

| Desde | Puede pasar a |
|---|---|
| SOLICITADO | EN_ESTUDIO, RECHAZADO, CANCELADO |
| EN_ESTUDIO | APROBADO, RECHAZADO, CANCELADO |
| APROBADO | DESEMBOLSADO, CANCELADO |
| RECHAZADO, DESEMBOLSADO, CANCELADO | — (son finales) |

- **CANCELADO** significa que el asociado desiste o que la entidad anula antes del desembolso. Después del desembolso no se cancela: eso sería otro proceso, fuera del alcance.
- **RECHAZADO y CANCELADO exigen una observación** (el motivo, hasta 500 caracteres).

### 2. Duplicados

**Un solo crédito en curso (SOLICITADO, EN_ESTUDIO o APROBADO) por asociado y por tipo de crédito**. Un duplicado responde 409 `CREDITO_DUPLICADO`.

- Un asociado sí puede tener a la vez créditos en curso de **tipos distintos**. Por ejemplo, uno educativo para una matrícula y uno de vehículo, que son líneas con condiciones distintas, como funcionan las cooperativas.
- Lo que se ataja es el **doble registro** de la misma solicitud: un doble clic, un reintento o dos oficinas con el mismo formulario.
- Los créditos desembolsados, rechazados, cancelados o eliminados no bloquean uno nuevo.
- La evaluación de la capacidad de pago (por ejemplo, el tope del 50 % del salario en libranza, Ley 1527 de 2012) queda fuera del alcance.

### 3. Asociado existente con otro nombre

Si llega una identificación ya registrada, pero con un nombre distinto, la respuesta es **422 `ASOCIADO_NOMBRE_NO_COINCIDE`**. Así se ataja que un error de digitación cargue el crédito a otra persona. La comparación la hace la BD con su collation, que no distingue mayúsculas ni tildes.

### 4. Edición

- Solo mientras el crédito está **SOLICITADO** se pueden editar sus condiciones: `tipoCredito`, `valorSolicitado`, `tasaInteres`, `numeroCuotas` y `formaPago`. En cualquier otro estado, la respuesta es 409 `CREDITO_NO_EDITABLE`.
- El estado cambia **solo** por `PATCH /api/creditos/{id}/estado`.

### 5. Borrado lógico

- `DELETE /api/creditos/{id}` funciona **solo en SOLICITADO** y **exige un motivo**. Marca `fechaEliminacion` y `usuarioEliminacionId`, y el crédito desaparece de los listados y deja de contar como duplicado. La fila y su historial se conservan.
- Desde EN_ESTUDIO en adelante, la salida es CANCELADO. Un DELETE en ese caso responde 409 `CREDITO_NO_ELIMINABLE`.

### 6. Concurrencia

Concurrencia optimista con `ROWVERSION`. La API devuelve `version`, y las ediciones, los cambios de estado y el borrado la exigen. Si el crédito cambió desde que se leyó, la respuesta es **409 `CREDITO_MODIFICADO`** y no se pisa el cambio del otro usuario.

### 7. Límites de los valores

| Campo | Regla |
|---|---|
| `valorSolicitado` | > 0, `DECIMAL(18,2)` |
| `tasaInteres` | % mensual, entre 0 y 100. El tipo `DECIMAL(6,4)` admite hasta 99,9999 |
| `numeroCuotas` | Entre 1 y 360 |
| Identificación | Mínimo 3 caracteres. CC y NIT solo dígitos (NIT sin dígito de verificación); CE, PA y PPT alfanuméricos |

La tasa de usura no se valida: la certifica la Superintendencia Financiera cada mes y queda fuera del alcance.

### 8. Qué es modificable y qué es inmutable

| Dato | ¿Modificable? | Garantía |
|---|---|---|
| `id`, `consecutivo` | Nunca | `consecutivo` es IDENTITY; `id` lo protege el service |
| `numeroCredito` | Nunca | Columna calculada: no admite UPDATE |
| Asociado del crédito (`asociadoId`) | Nunca | `DENY UPDATE` por columna al login de la app |
| `fechaSolicitud` | Nunca | `DENY UPDATE` por columna |
| Condiciones (tipo, valor, tasa, cuotas, forma de pago) | Solo en SOLICITADO | Service |
| `estado` | Solo con una transición válida | Service + `CHECK` de valores válidos |
| `fechaEliminacion`, `usuarioEliminacionId` | Una vez, en SOLICITADO | Service + `CHECK` (van juntos) |
| `HistorialCredito`, `CambiosCredito`, `WebhookIntentos` | Nunca, solo se insertan filas | `DENY UPDATE`, sin `DELETE`, y triggers que bloquean incluso al administrador |
| Cualquier fila | Nunca se borra físicamente | El login de la app no tiene `DELETE` |

### 9. Dónde vive cada regla

Cada regla vive en el **service**, que da el código de error y el mensaje para el usuario. Las que se pueden expresar como restricción están **también en la BD**, que las garantiza incluso ante un error en el código o ante dos peticiones simultáneas.

| Regla | Service | BD |
|---|---|---|
| Valor, tasa y cuotas en rango | ✔ | `CHECK` |
| Formato de la identificación por tipo | ✔ | `CHECK` |
| Nombre del asociado coincide | ✔ | — (la comparación usa la collation) |
| Duplicados | ✔ (409 con mensaje claro) | Índice único filtrado (garantía ante la concurrencia) |
| Transiciones permitidas | ✔ (`estadoTransiciones.ts`) | Solo valida que el estado exista y que el historial empiece en SOLICITADO |
| Observación al rechazar o cancelar | ✔ | `CHECK` en `HistorialCredito` |
| Edición solo en SOLICITADO | ✔ | — |
| Borrado solo en SOLICITADO, con motivo | ✔ | `CHECK` de motivo en `CambiosCredito` |
| Campos inmutables | ✔ | Columna calculada + `DENY UPDATE` por columna |
| Concurrencia | ✔ | `ROWVERSION` en el `WHERE` del UPDATE |

Las transiciones no se duplican en la BD: el mapa vive en un solo lugar (el código) y se prueba de forma unitaria.

### 10. Roles y cuatro ojos

La matriz definitiva, con la lectura y la cancelación, está en el [ADR 0016](0016-autenticacion-sesiones-y-permisos.md). Además de los roles, el service aplica dos reglas de **cuatro ojos**: **quien registra un crédito no lo aprueba, y quien lo aprueba no lo desembolsa**, aunque su rol lo permita (por ejemplo, un ADMIN). El punto de partida fue:

| Rol | Puede |
|---|---|
| ASESOR | Registrar, editar y eliminar solicitudes (en SOLICITADO); cancelar |
| ANALISTA | Pasar a EN_ESTUDIO, APROBADO o RECHAZADO; cancelar |
| TESORERIA | Pasar a DESEMBOLSADO |
| ADMIN | Todo, más la gestión de usuarios |

## Alternativas consideradas

- **Transiciones**: flujo estricto sin rechazo directo, o con devolución de EN_ESTUDIO a SOLICITADO.
- **Duplicados**: uno en curso por asociado (bloquea el caso legítimo de dos líneas distintas), o una ventana de tiempo para el doble envío (no se puede garantizar con un índice).
- **Edición**: también en EN_ESTUDIO, o nunca (solo observaciones).
- **Borrado**: en cualquier estado no final (se superpone con CANCELADO), o DELETE como atajo de CANCELADO (mezcla "registro erróneo" con "el asociado desistió").
- **Observación**: siempre obligatoria, o nunca.
- **Concurrencia**: solo transiciones condicionales (las ediciones se pisarían), o sin control.
- **Límites**: solo los del enunciado, o por tipo de crédito en el catálogo.

## Consecuencias

- **Positivas**:
  - La pregunta "¿dónde están las reglas?" tiene una respuesta concreta para cada una, con la tabla de la sección 9.
  - Las reglas críticas sobreviven a un error del código, porque la BD las vuelve a verificar.
  - Dos usuarios trabajando sobre el mismo crédito no se pisan.
- **Costos aceptados**:
  - Varias reglas están en dos lugares (service y BD), así que un cambio de regla toca ambos.
  - El cliente tiene que enviar `version` en cada modificación.

## Por definir en la implementación

Resuelto en los ADR [0015](0015-contrato-http-y-base-de-la-api.md) y [0017](0017-api-de-creditos-y-swagger.md):

- Una transición inválida responde 409 `TRANSICION_INVALIDA`, y una entrada inválida 400 `VALIDACION_FALLIDA` con un detalle por campo.
- Los esquemas Zod compartidos validan la forma y los rangos: montos, tasa, cuotas, formato de la identificación por tipo y observación obligatoria al rechazar o cancelar. El service valida lo que depende de la BD o del estado: catálogos activos, asociado, duplicados, transiciones, cuatro ojos, edición y borrado.

Última actualización: 2026-10-01
