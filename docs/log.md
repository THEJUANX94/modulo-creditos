---
type: log
tags: [modulo-creditos, changelog]
---

# Bitácora de cambios — Módulo de Créditos

## [0.1.0] - 2026-09-30 — Repositorio

### Added
- Repositorio git local con la rama `main` y el remoto público `origin` en [github.com/THEJUANX94/modulo-creditos](https://github.com/THEJUANX94/modulo-creditos). Todavía no tiene commits.
- `.gitignore`: dependencias, builds, `.env` (salvo `.env.example`), logs y archivos de editor y del sistema operativo.
- `.gitattributes`: finales de línea LF y binarios marcados.
- Sección "Git" y la excepción del nombre del repositorio en `02-desarrollo/convenciones.md`.

## [0.1.0] - 2026-09-30 — Trazabilidad y diseño visual

Segunda tanda de decisiones, todavía sin código.

### Added
- [ADR 0010](01-arquitectura/decisions/0010-logs-tecnicos-y-auditoria.md): logs técnicos con pino (JSON a stdout) correlacionados por requestId hasta la entrega del webhook, enmascaramiento de datos personales, y auditoría inmutable en la BD de cambios de estado, cambios de datos del crédito y eventos de seguridad.
- [ADR 0011](01-arquitectura/decisions/0011-diseno-visual-ui-ux-pro-max.md): el diseño visual del frontend se guía por la skill ui-ux-pro-max.
- `05-frontend/design-system.md`: estilo, paleta clara (banca, de la skill) y oscura (derivada) con su contraste medido, tipografía, radios, espaciado, foco, iconos y reglas de UX obligatorias.
- Sección "Trazabilidad" en `architecture.md`.

### Changed
- ADR 0002: el logger sale de sus pendientes, porque lo resuelve el ADR 0010.
- ADR 0005: los eventos de autenticación pasan a auditarse en la BD.

## [0.1.0] - 2026-09-30 — Decisiones de arquitectura

Primera entrada. Antes de escribir código se fijaron la estructura del repositorio, el stack, la estrategia del webhook y las convenciones de nombrado. Todavía no hay código.

### Added
- Estructura de documentación en `docs/` con el formato OKF (Open Knowledge Format).
- ADRs 0001 a 0009 en `01-arquitectura/decisions/`. Cada uno tiene contexto, alternativas consideradas, consecuencias y una lista de lo que queda por definir en la implementación.
- Resumen de decisiones técnicas en `01-arquitectura/decisiones-tecnicas.md`.
- Convenciones de idioma y nombrado en `02-desarrollo/convenciones.md`.
- Versión parcial de `01-arquitectura/architecture.md`: componentes, estructura del repositorio y flujo de creación de un crédito.
- Esqueleto de `setup-local.md`, `variables-entorno.md`, `deploy.md` y `troubleshooting.md`, marcados como pendientes.
