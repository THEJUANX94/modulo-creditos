---
type: reference
tags: [convenciones, nombrado, codigo]
---

# Convenciones de código

## Idioma

- **El dominio va en español**, como en el enunciado: `crearCredito`, `cambiarEstado`, `numeroCredito`, `historialCredito`.
- **Los términos técnicos van en inglés**: `middleware`, `errorHandler`, `repository`, `authGuard`.
- Cuando se combinan, el dominio va primero y el rol técnico después: `creditosService`, `creditosRepository`.

## Nombrado: camelCase por defecto

Va en camelCase:

- Variables, funciones y parámetros.
- Constantes, incluidas las de configuración: `maxReintentosWebhook`, `transicionesPermitidas`.
- Archivos y carpetas de código: `creditosService.ts`, `creditosController.ts`, `modules/creditos/`.
- Columnas SQL y campos JSON de la API, que coinciden 1:1 y no necesitan mapeo en Prisma: `numeroCredito`, `valorSolicitado`.
- Query params: `?tamanoPagina=20`.

## Excepciones

| Qué | Convención | Ejemplo | Motivo |
|---|---|---|---|
| Tablas SQL | PascalCase | `Creditos`, `Asociados`, `HistorialCredito` | Así las nombra el enunciado |
| Tipos, interfaces y clases de TypeScript | PascalCase | `Credito`, `CrearCreditoInput`, `AppError` | Es la convención universal de TypeScript y coincide con los modelos que Prisma genera desde las tablas |
| Componentes React y sus archivos | PascalCase | `CreditoForm.tsx` | React exige que los componentes empiecen con mayúscula |
| Archivos generados por shadcn/ui | kebab-case | `components/ui/dropdown-menu.tsx` | Los crea el CLI de shadcn/ui; renombrarlos a mano cada vez no aporta nada |
| Variables de entorno | UPPER_SNAKE | `DATABASE_URL` | Convención universal |
| Valores fijados por el enunciado | Como en el enunciado | `SOLICITADO`, `EN_ESTUDIO`, `CREDITO_NOT_FOUND`, `LIBRE_INVERSION`, `NOMINA`, `credito.creado` | Son datos, no identificadores de código, y coinciden 1:1 con lo que espera quien evalúa |
| Paquetes del workspace | Minúsculas con scope | `@creditos/api`, `@creditos/web`, `@creditos/shared` | npm no admite mayúsculas en los nombres de paquete |
| Documentación (`docs/`) | kebab-case | `decisions/0001-monorepo-pnpm-workspaces.md` | Lo fija el formato OKF |
| Repositorio en GitHub | kebab-case | `modulo-creditos` | Convención de nombres de repositorio en GitHub |
| Scripts compuestos de `package.json` | Con dos puntos | `format:check`, `dev:worker` | Convención de npm para agrupar variantes de un script |
| Restricciones, índices y triggers SQL | `PREFIJO_Tabla_columnaORegla` | `PK_Creditos`, `UX_Creditos_enCurso`, `CK_Creditos_valorSolicitado`, `TR_HistorialCredito_inmutable` | El prefijo dice qué es el objeto (PK, FK, UX, IX, CK, DF, TR) al leer un mensaje de error de la BD |
| Scripts SQL | `NNN-nombreEnCamelCase.sql` | `002-esquema.sql`, `001-crearBaseDatos.sql` | El número fija el orden de ejecución |

## Verificación automática

- **El lint hace cumplir la convención en los identificadores** con `@typescript-eslint/naming-convention` (ver `eslint.config.js`): camelCase en variables, funciones y parámetros; PascalCase en tipos, interfaces y clases; PascalCase permitido en funciones y variables de archivos `.tsx` (componentes React). Las propiedades admiten camelCase o UPPER_CASE (variables de entorno, valores del enunciado), y las que necesitan comillas (`'X-Request-Id'`) quedan libres.
- **Los nombres de archivo no se verifican con lint**, porque los de shadcn/ui son kebab-case. Se revisan a mano.
- **El formato lo aplica Prettier**: comillas simples, punto y coma, trailing commas y 100 columnas. `docs/` queda fuera.

## Git

- La rama principal es `main`.
- `.gitattributes` normaliza los finales de línea a LF. Un script `.sh` o `.sql` con CRLF falla dentro de los contenedores Linux de Docker.

## Módulos de la API

- **Cada capa exporta funciones** y se importa como espacio de nombres: `import * as healthRepository from './healthRepository'` → `healthRepository.verificarConexion()`.
- **Los errores esperados se lanzan con `AppError`** y un código del catálogo de `@creditos/shared` (`codigosError.ts`). Un código nuevo se agrega ahí, con su status HTTP.
- **Las respuestas exitosas se envían con `responderExito(res, data, { status, meta })`**, nunca armando el sobre a mano.
- **Ningún módulo lee `process.env`**: todo sale de los objetos de `src/config/`. `configBase` tiene lo común; `config`, lo de la API, y `configWorker`, lo del worker, que solo importa el código del worker. Los scripts de una sola vez (`src/scripts/`) leen y validan sus propias variables.
- **La entrada se valida con `validarEntrada(esquema, datos)`** y un esquema de `@creditos/shared`: devuelve los datos tipados, o lanza 400 `VALIDACION_FALLIDA` con un detalle por campo.
- **Cada módulo documenta sus rutas en su `*Docs.ts`** (OpenAPI), con los esquemas Zod de `@creditos/shared` y los errores posibles por ruta (`errores(...)`). Las respuestas también tienen esquema Zod, y su tipo se deriva de él.
- **Las rutas protegidas usan `autenticar()` y `autorizar(accion)`**, con una acción de la matriz de `@creditos/shared`.
- **En los `*Repository.ts`, las claves de objeto pueden ir en PascalCase**: son los campos de relación de Prisma, que llevan el nombre de su tabla (`select: { Usuarios: … }`). El lint lo permite solo en esos archivos.

## Frontend

- **Las páginas van en `src/paginas/` y los componentes propios en `src/components/`**, en PascalCase. Los de shadcn/ui, en `src/components/ui/`, son código de terceros: kebab-case, sin las reglas con tipos del lint, y se ajustan a mano solo donde contradicen el design system.
- **Los imports internos usan el alias `@/`** (`@/lib/api`), que exige el CLI de shadcn.
- **Las reglas, los permisos y las transiciones salen de `@creditos/shared`**: el frontend no repite ninguna.
- **Las llamadas a la API pasan por `lib/api.ts`** y se consumen con los hooks de `lib/consultas.ts`. Ningún componente llama a `fetch`.
- **Los colores se usan por token** (`bg-estado-aprobado-fondo`, `text-dorado`), nunca con un hexadecimal en un componente.

## Pruebas

- **Viven en `tests/` de cada paquete**, nunca en `src/`: `packages/shared/tests/`, `apps/api/tests/unitarias/`, `apps/api/tests/integracion/` y `apps/web/tests/`. Los archivos terminan en `.test.ts`, y las piezas comunes van en `tests/integracion/apoyo/`.
- **Los nombres de las pruebas describen la regla en español**, con el resultado esperado: `'RECHAZADO → DESEMBOLSADO, el ejemplo del enunciado → 409 TRANSICION_INVALIDA'`.
- **Las respuestas se leen con `exito(res, esquema)`, `lista(res, esquema)` y `fallo(res)`**, que las validan con los esquemas Zod de `@creditos/shared`: una prueba también falla si la respuesta se aparta del contrato de Swagger.
- **Nada se limpia entre pruebas**, porque las tablas de auditoría son inmutables. Cada prueba usa sus propios datos (`identificacionAleatoria()`), y los totales se comparan como diferencias.

## Rutas de la API

- **Una palabra por segmento.** Las rutas se diseñan para que no haga falta ningún separador; por ejemplo: `/api/creditos/{id}/estado`, `/api/auth/refresh`.
- Los query params van en camelCase.

Última actualización: 2026-10-01
