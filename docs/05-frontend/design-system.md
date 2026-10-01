---
type: reference
tags: [frontend, design-system, tokens, accesibilidad, ui-ux-pro-max]
---

# Sistema de diseño — parámetros visuales

Valores visuales del frontend del Módulo de Créditos. Cada valor indica su fuente: la base de datos de la skill **ui-ux-pro-max** v2.13.0, una regla de esa skill o una decisión propia justificada. Por qué se eligió cada uno: [ADR 0011](../01-arquitectura/decisions/0011-diseno-visual-ui-ux-pro-max.md).

## 1. Estilo

**Minimalism & Swiss Style + Accessible & Ethical.** Fuente: es el estilo que la skill recomienda para *Banking/Traditional Finance*.

- Limpio, funcional y en grilla, con espacio en blanco y una jerarquía tipográfica clara.
- Alto contraste, sin gradientes decorativos ni sombras en las superficies.
- Densidad estándar (escala de espaciado de la sección 5).
- Anti-patrones que marca la skill para el sector: diseño lúdico, gradientes morado/rosa y una UX de seguridad descuidada.

## 2. Color

Los contrastes se midieron con la fórmula de WCAG 2.x. El mínimo es 4.5:1 para texto y 3:1 para el foco.

### Modo claro

Fuente: la paleta "Banking/Traditional Finance" de la skill (*trust navy + premium gold*).

| Token | Valor | Texto encima | Contraste |
|---|---|---|---|
| Background | `#F8FAFC` | `#020617` | 19.28:1 |
| Foreground | `#020617` | — | — |
| Card | `#FFFFFF` | `#020617` | 20.17:1 |
| Primary | `#0F172A` | `#FFFFFF` | 17.85:1 |
| Secondary | `#1E3A8A` | `#FFFFFF` | 10.36:1 |
| Accent | `#A16207` | `#FFFFFF` | 4.92:1 |
| Muted | `#E8ECF1` | `#475569` | 6.39:1 |
| Muted foreground sobre fondo | `#475569` | — | 7.24:1 |
| Border | `#E2E8F0` | — | — |
| Destructive | `#DC2626` | `#FFFFFF` | 4.83:1 |
| Destructive como texto | `#DC2626` sobre `#F8FAFC` | — | 4.62:1 |
| Ring (foco) | `#0F172A` | — | 17.06:1 sobre el fondo |

### Modo oscuro

Fuente: decisión propia, derivada de la paleta clara con dos reglas de la skill:

- `color-dark-mode`: variantes tonales más claras, no colores invertidos, con el contraste probado por separado.
- `dark-mode-pairing`: el claro y el oscuro se diseñan juntos para mantener la marca.

| Token | Valor | Texto encima | Contraste | Origen |
|---|---|---|---|---|
| Background | `#020617` | `#F8FAFC` | 19.28:1 | Foreground del modo claro |
| Foreground | `#F8FAFC` | — | — | Background del modo claro |
| Card | `#0F172A` | `#F8FAFC` | 17.06:1 | Navy de la marca como superficie |
| Primary | `#E2E8F0` | `#0F172A` | 14.48:1 | Variante tonal clara del navy |
| Secondary | `#1E40AF` | `#FFFFFF` | 8.72:1 | Azul de la marca, un tono más claro |
| Accent | `#CA8A04` | `#020617` | 6.87:1 | Dorado original de la skill, antes de su ajuste para fondo claro |
| Accent como texto | `#CA8A04` sobre `#020617` | — | 6.87:1 | |
| Muted | `#1E293B` | `#94A3B8` | 5.71:1 | Neutros de las paletas oscuras de la skill |
| Muted foreground sobre fondo | `#94A3B8` | — | 7.87:1 | |
| Border | `#334155` | — | — | Usado en las paletas oscuras de la skill |
| Destructive | `#EF4444` | `#020617` | 5.36:1 | Rojo más claro, legible como texto en fondo oscuro |
| Destructive como texto | `#EF4444` sobre `#020617` / sobre card | — | 5.36:1 / 4.74:1 | |
| Ring (foco) | `#E2E8F0` | — | 16.36:1 sobre el fondo | Igual al primary |

### Selección del modo

- La primera vez se sigue la preferencia del sistema (`prefers-color-scheme`).
- El selector permite cambiar de modo, y la elección se recuerda en el navegador.

### Nota para la implementación: dos significados de "accent"

En la skill, **Accent** es un color de realce (el dorado). En shadcn/ui, la variable `--accent` es el **fondo de hover** de menús y listas. Si se asigna el dorado a `--accent`, todos los hovers de shadcn se vuelven dorados. El mapeo a las variables de shadcn/ui queda por definir.

## 3. Tipografía

Fuente: el par "Financial Trust" de la skill, recomendado para bancos, finanzas, seguros, inversión y fintech. La skill lo describe como serio y confiable, y excelente para datos.

| Parámetro | Valor | Fuente |
|---|---|---|
| Familia | IBM Plex Sans (una sola familia para títulos y texto) | Skill, par "Financial Trust" |
| Pesos | 300, 400, 500, 600, 700 | Skill (URL de Google Fonts del par) |
| Tamaño base del texto | 16 px | Skill, tabla de prioridades (Typography & Color) |
| Interlineado del texto | 1.5 | Skill, regla `line-height` (1.5–1.75) |
| Cifras en tablas y montos | Tabulares, para que no bailen al cambiar el valor | Skill, regla `number-tabular` |

## 4. Radios

Fuente: las plantillas de componentes del generador de la skill.

| Elemento | Radio |
|---|---|
| Botones e inputs | 8 px |
| Cards | 12 px |
| Modales | 16 px |

## 5. Espaciado

Fuente: el nivel de densidad *Standard* del generador de la skill. Coincide con la escala por defecto de Tailwind.

| Token | Valor | Clase de Tailwind | Uso |
|---|---|---|---|
| `xs` | 4 px | `1` | Separaciones mínimas |
| `sm` | 8 px | `2` | Entre icono y texto, espaciado en línea |
| `md` | 16 px | `4` | Padding estándar |
| `lg` | 24 px | `6` | Padding de secciones |
| `xl` | 32 px | `8` | Separaciones grandes |
| `2xl` | 48 px | `12` | Márgenes entre secciones |
| `3xl` | 64 px | `16` | Espacios mayores |

## 6. Superficies y sombras

Fuente: el estilo elegido (Minimalism & Swiss Style), que dice evitar sombras y gradientes.

- Las cards, las tablas y los paneles se separan con un **borde de 1 px** del color `Border`, sin sombra.
- Solo los **elementos flotantes** (dropdowns, popovers, modales) llevan una sombra sutil para separarse del contenido.
- El hover no eleva ni desplaza elementos: cambia el color.

## 7. Foco y movimiento

| Parámetro | Valor | Fuente |
|---|---|---|
| Anillo de foco | Visible, de 3 a 4 px, color `Ring`. Nunca se quita el `outline` sin reemplazarlo | Estilo Accessible & Ethical; regla `focus-states` |
| Transiciones | 200–250 ms, sutiles | Estilo Minimalism & Swiss Style |
| Movimiento reducido | Con `prefers-reduced-motion`, se reducen o desactivan las animaciones | Regla `reduced-motion` |

## 8. Iconos

- La librería es **Lucide**, la que usan los componentes de shadcn/ui.
- Siempre iconos SVG, **nunca emoji**. Fuente: tabla de prioridades de la skill (Style Selection).
- Un icono decorativo junto a un texto lleva `aria-hidden="true"`, y un botón que solo tiene icono lleva una etiqueta accesible. Fuente: regla `aria-labels`.

## 9. Reglas de UX obligatorias

Son reglas de la skill que se aplican en todas las pantallas. El identificador es el de `references/quick-reference.md` de la skill.

| Regla | Qué exige | Dónde aplica |
|---|---|---|
| `color-contrast` | Texto con al menos 4.5:1 (texto grande, 3:1) | Todo |
| `color-not-only` | No transmitir información solo con color: siempre un texto o un icono | Badges de estado del crédito, alertas |
| `keyboard-nav` | Orden de tabulación igual al orden visual y uso completo con teclado | Todo |
| `input-labels` | Label visible en cada input, nunca solo placeholder | Formularios de crédito y login |
| `inline-validation` | Validar al salir del campo, no en cada tecla | Formularios |
| `error-placement` | Error específico debajo de su campo, conectado con `aria-describedby` | Formularios |
| `error-clarity` | Cada mensaje dice la causa y cómo corregirla | Formularios y errores de la API |
| `loading-states` | Indicar la espera sin parpadeos en operaciones casi instantáneas | Tabla, dashboard, envíos |
| `empty-states` | Mensaje útil y una acción cuando no hay datos | Listado sin resultados, historial vacío |
| `toast-dismiss` / `toast-accessibility` | Los toasts se cierran solos en 3–5 s, no roban el foco y usan `aria-live="polite"` | Mensajes de éxito y error |
| `confirmation-dialogs` | Confirmar antes de una acción destructiva | Borrado lógico, rechazo y cancelación de un crédito |
| `destructive-emphasis` | Las acciones destructivas usan el color de peligro y están separadas de las principales | Botones de eliminar, rechazar y cancelar |

## Por definir

- Los colores de los estados del crédito (badges) en ambos modos.
- El mapeo de estos tokens a las variables CSS de shadcn/ui.
- La escala tipográfica (tamaños de títulos y texto secundario).
- El valor exacto de la sombra de los elementos flotantes.
- La carga de las fuentes: Google Fonts o servidas desde el propio proyecto.
- Los gráficos del dashboard.
- Los breakpoints.

Última actualización: 2026-09-30
