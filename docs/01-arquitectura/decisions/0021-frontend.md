---
type: decision
tags: [adr, frontend, react, vite, tailwind, shadcn, tanstack, accesibilidad]
---

# ADR 0021: Frontend — arquitectura, pantallas y sistema visual aplicado

## Estado

Aceptado (2026-10-01). Implementado en el paso 7. Verificado con 25 pruebas unitarias propias (233 en la suite completa) y un recorrido en el navegador contra la API, el worker y el mock reales.

## Contexto

El enunciado pide una interfaz para administrar créditos: dashboard con el total y las cantidades por estado; listado con búsqueda, filtros y paginación; creación con validaciones; detalle con historial; y mensajes claros de éxito, validación y error.

Ya estaban decididos:

- el stack: React, Vite, Tailwind, shadcn/ui y TanStack Table ([ADR 0002](0002-express-typescript-react-vite.md));
- el sistema visual de la skill ui-ux-pro-max ([ADR 0011](0011-diseno-visual-ui-ux-pro-max.md), [design-system.md](../../05-frontend/design-system.md));
- la sesión con el access token en memoria y el refresh en una cookie httpOnly ([ADR 0016](0016-autenticacion-sesiones-y-permisos.md)).

## Decisión

### Arquitectura

| Pieza | Elección | Por qué |
|---|---|---|
| Origen | **El mismo que la API**: la web llama a `/api`. En desarrollo, Vite reenvía `/api` a `localhost:3000`; en Docker lo hará Nginx | La cookie `SameSite=Strict` del refresh viaja sin trucos y CORS no hace falta. Es como se desplegaría en producción |
| Router | **React Router 8**. Las rutas protegidas van con `RutaProtegida`, que exige sesión, la contraseña definitiva y el permiso de la sección | Es el estándar, conocido por cualquier evaluador |
| Filtros del listado | **En la URL**, validados con `esquemaFiltrosCreditos` de `shared` | Un listado filtrado se puede recargar o compartir, y el dashboard enlaza cada estado al listado filtrado |
| Datos de la API | **TanStack Query**: una clave por consulta, y cada cambio invalida lo que deja desactualizado | Carga, error y refresco sin código repetido. Una notificación PENDIENTE se vuelve a consultar cada 5 s y se ve llegar a ENTREGADO |
| Formularios | **React Hook Form con los esquemas Zod de `shared`**, validando al salir de cada campo | El mismo mensaje en español en el navegador y en la API. Los errores de la API (400 por campo, nombre que no coincide, duplicado) también se muestran debajo de su campo |
| Cliente HTTP | `lib/api.ts`: **valida cada respuesta con el esquema de `shared`** y convierte los errores en `ErrorApi` con su código y su `requestId` | Si la API se aparta del contrato, falla en el cliente y no en un componente |
| Tabla | **TanStack Table v9** (`useTable`), con el orden y la paginación en el servidor | La decisión del ADR 0002, con columnas estables entre renders |
| Tema | **`lib/tema.tsx` propio**, con la clase `.dark`. Un script en `index.html` aplica el tema antes de pintar | `next-themes`, que trae shadcn, inyecta un `<script>` dentro de React y React 19 lo rechaza en el cliente |
| Carga | **Cada pantalla se descarga al entrar** (`React.lazy`) | La carga inicial baja de 1 MB a 324 kB (103 kB gzip): Recharts se descarga solo con el dashboard |

### Sesión en el navegador

- **El access token vive solo en memoria.** Al abrir o recargar la página, la web intenta `POST /auth/refresh` con la cookie: si hay sesión, entra sin login.
- **Si una petición responde 401 por token vencido**, la web refresca una vez y repite la petición. Si varias reciben 401 a la vez, comparten un solo refresh.
- **Un 401 `SESION_INVALIDA`** (otro login, una desactivación o el reuso del refresh) vuelve al login con un aviso que explica por qué.
- **Con la contraseña temporal pendiente**, solo se puede cambiar la contraseña.

### Pantallas

| Ruta | Quién | Qué tiene |
|---|---|---|
| `/login` | Todos | Validación al salir del campo; el error de credenciales en un aviso dentro del formulario |
| `/cambiar-contrasena` | Con la temporal pendiente | El cambio obligatorio |
| `/` | Todos | Dashboard: tarjetas con el total y el monto total; barras horizontales por estado, en el orden del flujo y con el valor en cada barra; y la misma información en una tabla, cuyas filas abren el listado filtrado |
| `/creditos` | Todos | Búsqueda (aplicada a los 400 ms y desde 2 caracteres), filtros por estado, tipo y fechas, orden por columna, paginación y, para ADMIN, incluir eliminados. Tabla en escritorio, tarjetas bajo 768 px |
| `/creditos/nuevo` | ASESOR y ADMIN | Formulario con los catálogos de la API; el monto con separadores de miles |
| `/creditos/:id` | Todos | Datos, acciones, historial como línea de tiempo y, para ADMIN, la notificación al sistema externo |
| `/usuarios` | ADMIN | Crear con contraseña temporal, cambiar el rol, y activar o desactivar (no a sí mismo) |
| `/webhook` y `/webhook/:eventId` | ADMIN | La traza: cada evento, cada intento con su resultado, y el payload enviado |

- **Navegación: barra superior** con las secciones que permite el rol. En pantallas pequeñas, las secciones van en un panel lateral que abre el botón de menú. A la derecha, el selector de tema y la cuenta (nombre, rol y cerrar sesión).
- **Acciones del detalle: solo las válidas** para el estado y el rol, con `puedeTransicionar` y `puedeCambiarA` de `shared`.
  - Todo cambio de estado se confirma en un diálogo.
  - Rechazar, cancelar y eliminar van en rojo, separadas de las principales, y piden el motivo.
  - Editar y eliminar aparecen solo en SOLICITADO.
  - Los cuatro ojos dependen de quién registró o aprobó, que el cliente no conoce: si la API responde 403, se muestra su mensaje.
  - Si la API responde 409 `CREDITO_MODIFICADO`, el detalle se recarga y se avisa.
- **Errores**: el mensaje de la API ya dice la causa, y el toast agrega el `requestId` como "código de soporte" ([ADR 0010](0010-logs-tecnicos-y-auditoria.md)).

### Formatos

- **Montos en pesos colombianos**: `$ 15.000.000` si no tienen centavos, y `$ 2.500.000,50` si los tienen. La parte entera se formatea como `BigInt`, así que el máximo de `DECIMAL(18,2)` se muestra exacto.
- **El campo de monto** muestra `25.000.000,5` mientras se escribe, pero el valor del formulario es el string exacto `"25000000.5"`, el que viaja a la API.
- **Fechas en hora de Colombia**, con el mes en letras: `1 de oct de 2026`, para que no se confundan el día y el mes.

### Sistema visual aplicado

Los pendientes del [design-system.md](../../05-frontend/design-system.md) quedan resueltos ahí:

- los colores de los estados;
- el mapeo a las variables de shadcn;
- la escala tipográfica y la sombra;
- las fuentes desde el propio proyecto;
- el gráfico del dashboard;
- los breakpoints.

Se ajustaron los componentes de shadcn donde contradecían el design system o las reglas de la skill:

- **Botones y campos de 40 px, y 44 px en pantallas táctiles** (`pointer-coarse`). El preset traía 32 px; la skill pide 44 px de área táctil.
- **Anillo de foco con el color `Ring` completo.** El preset lo traía al 50 % de opacidad.
- **El botón "destructive" sólido**, con 4.83:1 en claro y 5.36:1 en oscuro. El preset usaba un fondo translúcido con texto rojo, por debajo de 4.5:1.
- **El borde de los campos en `#64748B`**, con 4.76:1 sobre la card (3.75:1 en oscuro), porque un campo necesita 3:1 para que se vea (WCAG 1.4.11).
- **"Close" pasa a "Cerrar"** en los diálogos y el panel lateral.

### Calidad

- **Pruebas unitarias** (proyecto `web` de Vitest, con Testing Library sobre jsdom):
  - el cliente HTTP: refresh, refresh compartido, `SESION_INVALIDA`, sesión vencida, errores de la API, error de red y contrato;
  - las acciones por estado y rol, y los formatos;
  - el campo de monto y la validación del formulario de crédito al salir de cada campo.
- **Lint**: las reglas de hooks de React (`eslint-plugin-react-hooks`, pendiente del ADR 0012). Los componentes de `components/ui/`, copiados por el CLI de shadcn, se tratan como código de terceros: sin las reglas con tipos ni la convención de nombres.

## Hallazgos durante la implementación

- **Un error de formato no aparecía al salir del campo.** La regla "con CC o NIT la identificación solo admite dígitos" es un `superRefine` del objeto, y Zod lo salta mientras haya otro campo inválido: el formulario lo mostraba solo cuando todo lo demás estaba bien. En `shared`, la regla ahora corre con `when` en cuanto el tipo y el número son válidos. La encontró una prueba del formulario.
- **Vite sirvió una versión vieja de un archivo**: el observador de archivos no vio un cambio, probablemente porque el proyecto está en OneDrive. Se resuelve reiniciando el servidor de desarrollo con `--force` ([troubleshooting](../../03-operacion/troubleshooting.md)).

## Alternativas consideradas

- **Orígenes distintos con CORS**: depende de que el navegador envíe la cookie entre puertos.
- **TanStack Router**: tipos de punta a punta en las rutas, pero menos conocido y con más configuración.
- **Loaders de React Router, o `fetch` + `useEffect`**: menos control de caché, o cada pantalla reimplementa la carga y el error.
- **TanStack Form, o formularios a mano**.
- **Un refresh programado antes de vencer**: igual hay que manejar el 401, y una pestaña inactiva refresca sin uso.
- **Solo las pantallas del enunciado**: la gestión de usuarios y la traza quedarían solo en Swagger.
- **Barra lateral**: fue la recomendación inicial; se eligió la barra superior, que deja más ancho a la tabla.
- **Mostrar deshabilitadas las acciones no permitidas**: llena la pantalla de botones inactivos.
- **Badges neutros**, **solo tarjetas en el dashboard** o **una dona**: la skill desaconseja la dona con más de 5 categorías.
- **Google Fonts**, **el dorado en `--accent`**, **la tabla con scroll horizontal en móvil**, **una escala tipográfica modular** y **montos siempre con dos decimales**.
- **Playwright** o **sin pruebas del frontend**.
- **Mantener `next-themes`**: el aviso de React 19 quedaría en la consola.

## Consecuencias

- **Positivas**:
  - El frontend no repite ninguna regla: los esquemas, las transiciones y los permisos salen de `shared`. Solo la API decide lo que depende de la BD.
  - Toda pantalla tiene sus estados de carga, vacío y error; los errores dicen la causa y traen el código de soporte.
  - Funciona con teclado, con el foco siempre visible, y respeta el movimiento reducido.
- **Costos aceptados**:
  - El primer `POST /auth/refresh` responde 401 cuando no hay sesión, y el navegador lo muestra en la consola. Es el comportamiento esperado.
  - La paginación de usuarios y de la traza vive en el estado del componente, no en la URL.
  - Los componentes de shadcn se actualizan a mano: el CLI no sabe de los ajustes hechos.

## Verificación (2026-10-01)

- **Pruebas:** 25 propias del frontend y 233 en la suite completa, todas en verde. Typecheck, lint, formato y build de producción limpios.
- **En el navegador**, contra la API, el worker y el mock reales:
  - login con validación al salir del campo;
  - la sesión recuperada al abrir otra pestaña;
  - el dashboard con los datos reales, y el listado filtrado desde la URL;
  - la creación de un crédito: monto `25.000.000,5`, que se ve como `$ 25.000.000,50`;
  - en el detalle, la notificación pasó sola de Pendiente a Entregado, sin recargar;
  - el cambio a En estudio con su confirmación, que actualizó el historial y las acciones;
  - el 403 de los cuatro ojos mostrado en un toast;
  - los usuarios (el ADMIN no puede desactivarse) y la traza del webhook;
  - sin errores de consola, salvo el 401 esperado del refresh inicial.
- **Pendiente:** la revisión visual completa en claro, oscuro y móvil. Las capturas de pantalla fallaron mientras la ventana de Claude estaba minimizada.

Última actualización: 2026-10-01
