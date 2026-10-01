---
type: reference
tags: [setup, desarrollo, pnpm, node]
---

# Configurar el entorno de desarrollo local

> **Parcial.** Cubre el workspace y la verificación de código. La base de datos, Docker, las variables de entorno y el arranque de cada app se agregan en sus pasos.

## Requisitos

| Herramienta | Versión | Cómo verificar |
|---|---|---|
| Node.js | 24 LTS (ver `.nvmrc`) | `node -v` |
| pnpm | 12.8.1 (ver `packageManager` en `package.json`) | `pnpm -v` |
| Git | Cualquier versión reciente | `git --version` |

**pnpm 12 se instala de forma global con npm**:

```bash
npm install -g pnpm@12.8.1
```

En Windows no basta con el cambio automático de versión de pnpm. Ver [troubleshooting.md](../03-operacion/troubleshooting.md#pnpm-12-no-arranca-en-windows-no-se-reconoce-como-un-comando).

## Instalar dependencias

```bash
pnpm install
```

pnpm bloquea los scripts de instalación de las dependencias que no están en `allowBuilds` (`pnpm-workspace.yaml`). Si agregas una dependencia que los necesita, la instalación falla con `ERR_PNPM_IGNORED_BUILDS`: agrégala a `allowBuilds` y vuelve a instalar.

## Verificar el código

Desde la raíz:

| Comando | Qué hace |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` en cada paquete |
| `pnpm lint` | ESLint con reglas con tipos y la convención de nombres |
| `pnpm format` | Formatea con Prettier (no toca `docs/`) |
| `pnpm format:check` | Verifica el formato sin modificar archivos |

## Comandos por paquete

Se ejecutan con `pnpm -F <paquete> <script>`, por ejemplo `pnpm -F @creditos/api build`.

| Paquete | Scripts |
|---|---|
| `@creditos/api` | `dev` (API con recarga), `dev:worker` (worker con recarga), `build` (bundle con tsup en `dist/`), `start`, `start:worker`, `typecheck` |
| `@creditos/web` | `typecheck` |
| `@creditos/webhook-mock` | `typecheck` |
| `@creditos/shared` | `typecheck` |

Última actualización: 2026-09-30
