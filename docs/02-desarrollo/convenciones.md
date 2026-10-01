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

## Verificación automática

- **El lint hace cumplir la convención en los identificadores** con `@typescript-eslint/naming-convention` (ver `eslint.config.js`): camelCase en variables, funciones y parámetros; PascalCase en tipos, interfaces y clases; PascalCase permitido en funciones y variables de archivos `.tsx` (componentes React). Las propiedades admiten camelCase o UPPER_CASE (variables de entorno, valores del enunciado), y las que necesitan comillas (`'X-Request-Id'`) quedan libres.
- **Los nombres de archivo no se verifican con lint**, porque los de shadcn/ui son kebab-case. Se revisan a mano.
- **El formato lo aplica Prettier**: comillas simples, punto y coma, trailing commas y 100 columnas. `docs/` queda fuera.

## Git

- La rama principal es `main`.
- `.gitattributes` normaliza los finales de línea a LF. Un script `.sh` o `.sql` con CRLF falla dentro de los contenedores Linux de Docker.

## Rutas de la API

- **Una palabra por segmento.** Las rutas se diseñan para que no haga falta ningún separador; por ejemplo: `/api/creditos/{id}/estado`, `/api/auth/refresh`.
- Los query params van en camelCase.

Última actualización: 2026-09-30
