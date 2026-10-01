---
type: decision
tags: [adr, frontend, diseno, ui-ux-pro-max, accesibilidad]
---

# ADR 0011: Diseño visual del frontend guiado por la skill ui-ux-pro-max

## Estado

Aceptado (2026-09-30).

## Contexto

El enunciado evalúa el frontend y la UX: dashboard, listado con búsqueda, filtros y paginación, formulario con validaciones, detalle con historial, y mensajes claros para éxitos, validaciones y errores de la API. Si los parámetros visuales no están fijados antes de construir, cada pantalla los improvisa y el resultado es inconsistente.

Para fijarlos se usa la skill **ui-ux-pro-max** (v2.13.0), una base de datos de estilos, paletas, pares tipográficos y guías de UX con su justificación. Los productos de su catálogo más cercanos a este panel son:

- **Banking/Traditional Finance**, por el sector.
- **Financial Dashboard**, por el dashboard.
- **Invoice & Billing Tool**, por el flujo: documentos que pasan por estados.

La skill trae un generador (`--design-system`) y un modo para persistir el resultado (`--persist`), que requieren Python. Python no está instalado en el equipo de desarrollo, así que **se consultó directamente la base de datos de la skill** (sus archivos CSV) y las plantillas de su generador.

## Decisión

1. **La skill es la referencia para las decisiones visuales y de UX del frontend.** Los valores elegidos, con su fuente, están en [design-system.md](../../05-frontend/design-system.md).
2. **Estilo: Minimalism & Swiss Style + Accessible & Ethical**, que es lo que la skill recomienda para Banking/Traditional Finance (severidad HIGH). Limpio, de alto contraste, en grilla y con densidad estándar.
3. **Paleta: "Banking/Traditional Finance"** (*trust navy + premium gold*) en modo claro. La paleta oscura se **deriva** de ella con dos reglas de la skill, `color-dark-mode` y `dark-mode-pairing`, y su contraste está medido.
4. **Modo claro y oscuro con selector.** La primera vez se sigue la preferencia del sistema (`prefers-color-scheme`) y, si el usuario cambia el selector, se recuerda su elección en ese navegador.
5. **Tipografía: IBM Plex Sans**, el par "Financial Trust" de la skill.
6. **Radios del generador de la skill**: 8 px en botones e inputs, 12 px en cards y 16 px en modales.
7. **Las superficies se separan con bordes, sin sombras**, como pide el estilo. Solo los elementos flotantes (dropdowns, modales) llevan una sombra sutil.
8. **Iconos: Lucide**, la librería que usan los componentes de shadcn/ui, con las reglas de la skill: siempre SVG, nunca emoji, y `aria-hidden` o etiqueta accesible según el caso.
9. **Reglas de UX de la skill que son obligatorias** en todas las pantallas: ver la sección "Reglas de UX" de [design-system.md](../../05-frontend/design-system.md).

## Alternativas consideradas

- **Estilo Data-Dense Dashboard**, recomendado para Financial Dashboard. La skill lo asocia a modo oscuro y a datos en tiempo real (trading), que no es este caso.
- **Estilo Flat + Minimalism**, recomendado para Invoice & Billing Tool. Encaja con el flujo por estados, pero no con el sector.
- **Paletas "Invoice & Billing Tool"** (navy y verde), **"Government/Public Service"** (navy y azul) e **"Insurance Platform"** (azul y verde).
- **Tipografías Inter** ("Minimal Swiss"), **Lexend + Source Sans 3** ("Corporate Trust") y **Fira Sans + Fira Code** ("Dashboard Data").
- **Solo modo claro.** Es menos trabajo, pero no hay modo oscuro.
- **Oscuro por defecto.** La skill lo asocia a Financial Dashboard.
- **Usar tal cual una paleta oscura de la skill** ("Financial Dashboard" o "Password Manager"). Cambian el dorado por verde y rompen la identidad de la paleta clara.
- **Radios más rectos** (4/6/8 px) o **un solo radio** de 8 px (el default de shadcn/ui).
- **La escala de sombras del generador**, con cards que se elevan al pasar el mouse. Contradice el estilo elegido.
- **Phosphor**, la librería de iconos del catálogo de la skill. Obligaría a reemplazar Lucide en los componentes de shadcn/ui o a convivir con dos librerías.
- **Instalar Python y persistir el sistema** con `--persist` (`design-system/.../MASTER.md`). Se prefirió documentarlo en `docs/`, con el resto de la documentación OKF.

## Consecuencias

- **Positivas**:
  - Cada valor visual tiene una fuente rastreable (la skill o una regla de la skill) y una justificación para la socialización.
  - La paleta clara y la oscura cumplen 4.5:1 en todos los pares de texto, medidos antes de escribir código.
  - El estilo prioriza la legibilidad y el contraste, lo que encaja con un panel de back office financiero.
- **Costos aceptados**:
  - Hay dos temas que mantener y verificar.
  - La paleta oscura es propia del proyecto, no viene de la base de la skill. Se justifica con las reglas de la skill y con el contraste medido.
  - No se usó el generador completo de la skill. Si se instala Python, se puede correr para comparar su resultado con lo elegido.

## Por definir en la implementación

- Los colores de los estados del crédito (badges) en ambos modos, siempre acompañados de texto (`color-not-only`).
- El mapeo a las variables CSS de shadcn/ui (ver la nota sobre `accent` en [design-system.md](../../05-frontend/design-system.md)).
- La escala tipográfica (tamaños de títulos y texto secundario).
- El valor exacto de la sombra de los elementos flotantes.
- Si las fuentes se cargan desde Google Fonts o se sirven desde el propio proyecto.
- Los gráficos del dashboard: tipo de gráfico y librería.
- Los breakpoints y el comportamiento en pantallas pequeñas.

Última actualización: 2026-09-30
