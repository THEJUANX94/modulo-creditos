---
type: decision
tags: [adr, seguridad, autenticacion, sesiones, jwt, argon2, permisos, usuarios]
---

# ADR 0016: Autenticación, sesión única y permisos

## Estado

Aceptado (2026-10-01). Implementado en el paso 4b y verificado de punta a punta contra la API compilada: 47 pruebas, más la medición de tiempos.

## Contexto

El [ADR 0005](0005-jwt-acceso-refresh-cookie-httponly.md) fijó el modelo: access token JWT de vida corta, refresh token rotativo en cookie httpOnly, usuarios con roles y eventos de autenticación auditados. Quedaban por definir los algoritmos, la vida de los tokens, la detección de robo, la protección CSRF, los límites contra fuerza bruta, la matriz de permisos y la creación de usuarios.

Durante el diseño se agregó un requisito: **en una aplicación de créditos no debe haber dos sesiones abiertas del mismo usuario**.

## Decisión

### Criptografía y tokens

| Pieza | Elección |
|---|---|
| Hash de contraseñas | **Argon2id** con `@node-rs/argon2` (binarios precompilados, sin node-gyp), con los parámetros mínimos de OWASP: 19 MiB, 2 iteraciones, 1 hilo |
| Access token | **JWT HS256** con `jose`, firmado con `JWT_SECRET` (mínimo 32 caracteres). Lleva `sub` (usuario), `sid` (sesión), `rol`, `iss` y `aud`. Se verifica con el algoritmo fijo, sin aceptar el que declare el token (evita la confusión de algoritmos) |
| Vida | Access token **15 min**; sesión **8 h** desde el login (una jornada). La rotación no la extiende |
| Refresh token | **Opaco**: 256 bits aleatorios. En la BD solo se guarda su hash SHA-256 |
| Access token en el frontend | **Solo en memoria**, nunca en localStorage. Al recargar, el frontend llama a `/refresh` |

### Sesión única

1. **Un login nuevo reemplaza a la sesión anterior.** La revoca (`NUEVA_SESION`) y registra `SESION_REEMPLAZADA`. Si el usuario cerró el navegador sin salir, puede volver a entrar; si alguien entra con su contraseña, la víctima ve que la echaron.
2. **La BD garantiza una sola sesión activa** con el índice único filtrado `UX_Sesiones_activa (usuarioId) WHERE fechaRevocacion IS NULL`. Dos logins simultáneos chocan en el índice: el segundo se reintenta y reemplaza al primero.
3. **Cada petición autenticada verifica en la BD que su sesión siga viva y el usuario activo**, con una consulta indexada. El access token viejo de una sesión reemplazada deja de servir en su siguiente petición, sin esperar los 15 minutos. Por lo mismo, desactivar un usuario o cambiarle el rol es inmediato. El rol se toma de la BD, no del token. **Esto reemplaza la decisión inicial de verificar solo al refrescar.**

### Refresh y detección de robo

4. **Rotación con detección de reuso.** Cada uso marca el token (`fechaUso`) y emite uno nuevo de la misma sesión. Si aparece un token ya rotado, es señal de robo: se revoca la sesión entera (`REUTILIZACION`) y se registra `REFRESH_REUTILIZADO`. El ladrón y la víctima pierden la sesión, y la víctima vuelve a iniciarla.
5. **Gracia de 10 segundos**: un token rotado hace menos de 10 s se acepta una vez más, para que dos pestañas que refrescan a la vez no se confundan con un robo (como el "reuse interval" de Auth0).
6. **Cookie**: `HttpOnly`, `Secure` (los navegadores la aceptan en http://localhost), `SameSite=Strict`, `Path=/api/auth`, y vence cuando vence la sesión.
7. **CSRF**: además de SameSite y CORS, `/refresh` y `/logout` exigen el header `X-CSRF: 1`, que un formulario de otro sitio no puede enviar (`CSRF_INVALIDO`).

### Fuerza bruta y enumeración

8. **Login con mensaje genérico y tiempo constante.** Un correo inexistente, una contraseña incorrecta y un usuario inactivo responden igual (401 `CREDENCIALES_INVALIDAS`). Si el correo no existe, se verifica igual contra un **hash ficticio, calculado al arrancar**, para que el tiempo de respuesta no delate qué correos existen.
9. **Rate limit** (express-rate-limit, almacén en memoria):

   | Límite | Ventana | Clave |
   |---|---|---|
   | 5 intentos **fallidos** | 15 min | IP + correo: frena la fuerza bruta sobre una cuenta sin bloquearla para los demás |
   | 20 intentos de login | 15 min | IP |
   | 300 peticiones | 1 min | IP, toda la API salvo el health |

   Al exceder: 429 `DEMASIADAS_SOLICITUDES` con `Retry-After`.
10. **Sin bloqueo de cuentas**: bloquear permitiría a un atacante dejar sin acceso a cualquier usuario fallando 5 veces.

### Usuarios y contraseñas

11. **Política de contraseñas**: entre 12 y 128 caracteres, sin reglas de composición y distinta del correo (NIST 800-63B / OWASP).
12. **La contraseña que asigna un ADMIN es temporal** (`debeCambiarContrasena`). Hasta cambiarla, el usuario solo puede usar `/me`, `/contrasena` y `/logout` (403 `CAMBIO_CONTRASENA_REQUERIDO`). Cambiarla cierra la sesión y abre una nueva.
13. **Gestión de usuarios (solo ADMIN)**: listar (paginado), crear, activar o desactivar, y cambiar el rol. Desactivar o cambiar el rol corta la sesión del usuario. **Un ADMIN no puede desactivarse ni cambiarse el rol a sí mismo**, así que siempre queda al menos un administrador.
14. **Usuarios demo**: `pnpm -F @creditos/api usuarios:crear` crea `asesor@`, `analista@`, `tesoreria@` y `admin@creditos.test` (`.test` es un dominio reservado) con la contraseña de `USUARIOS_DEMO_CLAVE`. Es idempotente, y los demo no tienen cambio obligatorio.

### Permisos

15. **La matriz vive en `@creditos/shared`** (`permisos.ts`). La API la aplica con `autorizar(accion)`, y el frontend la usa para mostrar u ocultar acciones.

    |  | ASESOR | ANALISTA | TESORERIA | ADMIN |
    |---|:-:|:-:|:-:|:-:|
    | Ver créditos, historial, resumen y catálogos | ✓ | ✓ | ✓ | ✓ |
    | Crear, editar y eliminar (en SOLICITADO) | ✓ | | | ✓ |
    | → EN_ESTUDIO, APROBADO, RECHAZADO | | ✓ | | ✓ |
    | → DESEMBOLSADO | | | ✓ | ✓ |
    | → CANCELADO | ✓ | ✓ | | ✓ |
    | Traza del webhook, gestión de usuarios | | | | ✓ |

16. **Cuatro ojos**: **quien registra un crédito no lo aprueba, y quien lo aprueba no lo desembolsa**, aunque su rol lo permita (por ejemplo, un ADMIN). Depende del crédito concreto, así que lo aplica el service de créditos (paso 4c).

### Auditoría

17. **`EventosSeguridad`, inmutable** (trigger + `DENY UPDATE`): login exitoso y fallido (con el correo intentado), refresh, reuso, sesión reemplazada, logout, acceso denegado, y creación, activación, desactivación, cambio de rol y cambio de contraseña de usuarios. `usuarioId` es quién hizo la acción y `usuarioAfectadoId` a quién se le hizo; `detalle` dice qué cambió (por ejemplo, `ADMIN → ANALISTA`).
18. **Los cambios y su evento van en la misma transacción**, así que nunca hay un cambio sin auditoría. Los intentos fallidos y los accesos denegados se registran aparte: si ese registro falla, se loguea y la respuesta no cambia.
19. **Un token vencido no se registra**, porque es el flujo normal (el frontend refresca). Sí se registran los tokens con firma inválida o manipulados.

### Endpoints

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `POST /api/auth/login` | Público (rate limit) | `{ correo, contrasena }` → `{ accessToken, expiraEn, usuario }` + cookie |
| `POST /api/auth/refresh` | Cookie + `X-CSRF` | Rota el refresh y emite un access token nuevo |
| `POST /api/auth/logout` | Cookie + `X-CSRF` | Revoca la sesión y borra la cookie. Idempotente |
| `POST /api/auth/contrasena` | Autenticado (aun con la temporal) | Cambia la contraseña y abre una sesión nueva |
| `GET /api/auth/me` | Autenticado (aun con la temporal) | Usuario y rol |
| `GET /api/usuarios` · `POST /api/usuarios` | ADMIN | Lista paginada / crea con contraseña temporal |
| `PATCH /api/usuarios/{id}/estado` · `/{id}/rol` | ADMIN | Activa o desactiva / cambia el rol |

Las respuestas con tokens llevan `Cache-Control: no-store`.

### Paginación

20. Es común a todos los listados (`esquemaPaginacion` en `@creditos/shared`): `pagina` desde 1, `tamanoPagina` de 20 por defecto y máximo 100. Un tamaño mayor responde 400, sin recortarse en silencio.

## Alternativas consideradas

- **Hash**: el paquete `argon2` (compila con node-gyp) o bcrypt (más débil frente a GPU y trunca a 72 bytes).
- **JWT**: EdDSA (útil si varios servicios verificaran los tokens) o `jsonwebtoken` (CommonJS, con historial de confusión de algoritmos).
- **Vida**: refresh de 7 días (una sesión olvidada queda abierta una semana) o access de 5 min con refresh de 1 h.
- **Refresh sin estado (JWT)**: no se puede revocar ni detectar su reuso.
- **Access token en sessionStorage**: lo lee cualquier script con XSS.
- **Varias sesiones por usuario**: descartado por el requisito de sesión única. **Rechazar el login nuevo** mientras haya una sesión: deja sin acceso a quien cerró el navegador sin salir y permite bloquear al usuario legítimo entrando primero.
- **Mantener la validación sin estado**, o bajar el access token a 5 min: el token viejo seguiría sirviendo hasta vencer.
- **Solo la tabla `RefreshTokens` con familia**: el estado de la sesión quedaría repartido, y la sesión única no se podría garantizar con un índice.
- **Sin gracia de reuso**, con coordinación de pestañas en el frontend: si la coordinación falla, el usuario pierde la sesión.
- **Solo SameSite**, sin header anti-CSRF.
- **Bloqueo de cuentas**: abre una denegación de servicio sobre cualquier usuario. **Distinguir al usuario inactivo** en el login: confirma que la cuenta existe.
- **Reglas de composición** en las contraseñas: NIST las desaconseja.
- **Contraseña de usuarios demo aleatoria o en un SQL con hashes fijos**: se pierde, o queda pública en el repositorio.
- **ADMIN sin operación de negocio**, o **sin cuatro ojos**.
- **Registrar los tokens vencidos**: un evento cada 15 minutos por usuario activo.

## Consecuencias

- **Positivas**:
  - Ningún usuario tiene dos sesiones operando, ni siquiera por unos minutos.
  - Desactivar a alguien o quitarle un rol es inmediato.
  - Un refresh token robado se detecta en su primer reuso.
  - Cada acción sobre sesiones y usuarios deja un evento inmutable que dice quién, a quién, desde dónde y qué cambió.
- **Costos aceptados**:
  - **Cada petición autenticada hace una consulta a la BD.** Con muchas réplicas y mucho tráfico iría a una caché (Redis) con invalidación al revocar (propuesta de escalabilidad).
  - **El rate limit está en la memoria de cada proceso**: con varias réplicas, cada una cuenta por su lado (en producción, Redis). En desarrollo, reiniciar la API lo reinicia.
  - **Dos pestañas no pueden tener sesiones distintas**: comparten la misma, por la cookie.
  - Prisma introspecta `UX_Sesiones_activa` como si `usuarioId` fuera único en toda la tabla. **No se usa la relación `Usuarios → Sesiones` ni `findUnique` por `usuarioId`**: hay muchas sesiones revocadas por usuario.
  - Las filas de `Sesiones`, `RefreshTokens` y `EventosSeguridad` no se borran (la app no tiene `DELETE`): su retención es una tarea de operación.

## Verificación (2026-10-01)

Pruebas de punta a punta contra el bundle de producción y la BD del compose: **47 casos con el resultado esperado**.

- **Login**: credenciales inválidas, correo inexistente, entrada mal formada (400 con `details`), correo en mayúsculas, `Cache-Control: no-store`, atributos de la cookie, cookie de 8 h y token de 15 min.
- **Permisos**: sin token (401), rol sin permiso (403 y evento), y token con el rol cambiado a mano (401 por firma inválida).
- **Refresh**: sin `X-CSRF` (403), rotación sin extender la sesión, gracia de 10 s, y reuso a los 11 s, que revoca la sesión entera (incluido el access token vigente y el refresh más reciente).
- **Sesión única**: el segundo login corta la primera sesión al instante, y con dos logins simultáneos queda una sola sesión viva.
- **Usuarios**: creación (201), correo duplicado (409), validación (400), paginación y el máximo de 100. La contraseña temporal bloquea las demás rutas (403) y su cambio abre una sesión nueva e invalida la anterior. Cambiar el rol o desactivar cortan la sesión; un usuario inactivo no entra; el ADMIN no puede desactivarse a sí mismo; id inválido (400); usuario inexistente (404).
- **Logout**: borra la cookie, invalida el access token y es idempotente.
- **Rate limit**: el sexto fallo sobre la misma cuenta responde 429 con `Retry-After`, y otra cuenta desde la misma IP sigue entrando.

Además, consultando la BD:

- **Tiempo de respuesta del login**, con la API caliente: mediana de 41 ms con un correo existente y 37 ms con uno inexistente. La primera medición mostró que el hash ficticio, calculado con el primer correo inexistente, hacía esa respuesta distinta; por eso ahora se calcula al arrancar.
- **EventosSeguridad** quedó con los tipos esperados (por ejemplo `USUARIO_ROL_CAMBIADO | ADMIN → ANALISTA`), y la app no puede modificarla.
- **Sesiones**: nunca hay más de una activa por usuario, y aparecen los seis motivos de revocación.
- **Logs**: cada petición autenticada lleva su `usuarioId`, y no aparece ninguna contraseña ni token.

Última actualización: 2026-10-01
