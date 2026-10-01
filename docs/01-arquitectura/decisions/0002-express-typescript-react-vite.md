---
type: decision
tags: [adr, express, typescript, react, vite, tailwind, shadcn]
---

# ADR 0002: Express + TypeScript en la API, React + Vite con Tailwind y shadcn/ui en el frontend

## Estado

Aceptado (2026-09-30).

## Contexto

La prueba recomienda **Node.js + TypeScript + Express** para el backend, y JavaScript/TypeScript con React, Angular, Vue o Svelte para el frontend.

El frontend es un panel administrativo: dashboard con totales por estado, listado con búsqueda, filtros y paginación, formulario de creación con validaciones y detalle con historial. No necesita SEO ni render en servidor.

## Decisión

1. **API**: Node.js + TypeScript + Express, como recomienda la prueba.
2. **Frontend**: una SPA con **React + Vite**. El build es estático y en Docker lo sirve Nginx.
3. **UI**: **Tailwind CSS + shadcn/ui**. Los componentes de shadcn/ui se copian al proyecto como código propio. La tabla del listado (filtros, paginación y orden) se arma con **TanStack Table**.

## Alternativas consideradas

- **Next.js.** También es React, pero con SSR y App Router, y agrega un servidor Node más que este panel no necesita.
- **Angular.** Es un framework completo y opinado (formularios reactivos, inyección de dependencias), común en el sector financiero, pero con más boilerplate para el tiempo de la prueba.
- **Vue 3 + Vite.** Es liviano y de curva corta, una opción equivalente para este alcance; se eligió React.
- **Mantine** (UI). Es una librería completa con formularios, notificaciones y tablas, rápida para paneles administrativos.
- **Ant Design** (UI). Es la más rápida para CRUDs, con Table y Form ya resueltos, pero su estética es corporativa y cuesta personalizarla.
- **MUI** (UI). Su DataGrid tiene las funciones avanzadas en la versión de pago, y la librería es pesada.

## Consecuencias

- **Positivas**:
  - Tailwind ya se conoce de proyectos anteriores.
  - Los componentes de shadcn/ui son accesibles y quedan como código del proyecto, sin depender de un tema cerrado.
  - El frontend se despliega como archivos estáticos: no tiene estado y escala detrás de cualquier servidor web o CDN.
- **Costos aceptados**:
  - La tabla con filtros y paginación da más trabajo que con Ant Design o Mantine, que la traen resuelta.
  - El CLI de shadcn/ui genera archivos en kebab-case, que quedan como excepción a camelCase (ver [convenciones](../../02-desarrollo/convenciones.md)).

## Por definir en la implementación

- Versión de Express (4 o 5).
- Sistema de módulos de la API (ESM o CommonJS).
- Router del frontend, librería para consumir la API y manejo de formularios.
- Linter y formateador.

El logger quedó decidido en el [ADR 0010](0010-logs-tecnicos-y-auditoria.md) y los parámetros visuales en el [ADR 0011](0011-diseno-visual-ui-ux-pro-max.md).

Última actualización: 2026-09-30
