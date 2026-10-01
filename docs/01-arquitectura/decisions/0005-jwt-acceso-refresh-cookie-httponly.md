---
type: decision
tags: [adr, seguridad, autenticacion, jwt, roles]
---

# ADR 0005: Access token JWT + refresh token rotativo en cookie httpOnly, con usuarios y roles

## Estado

Aceptado (2026-09-30).

## Contexto

La prueba exige que la API esté asegurada y que se documenten y justifiquen los mecanismos usados. El ingreso de usuarios en el frontend no es obligatorio, pero se valora.

Además, el historial de cambios (sección 11 del enunciado) incluye el **usuario** que hizo cada cambio, y no todas las acciones pesan igual: crear un crédito no es lo mismo que aprobarlo o desembolsarlo.

## Decisión

1. **Usuarios propios en la BD**, con la contraseña hasheada y un rol.
2. **El login entrega dos tokens**: un access token JWT de vida corta y un refresh token en una cookie httpOnly. El refresh token **rota** en cada uso.
3. **Los roles restringen acciones** como aprobar o desembolsar, y el usuario autenticado queda registrado en el historial del crédito.
4. **Endurecimiento HTTP**: `helmet`, CORS restringido al origen del frontend y rate limit.
5. **Los eventos de autenticación quedan auditados en la BD**: login exitoso y fallido, refresh, logout y accesos denegados. Ver el [ADR 0010](0010-logs-tecnicos-y-auditoria.md).

## Alternativas consideradas

- **Solo access token JWT, sin refresh.** Es más simple, pero obliga a elegir entre una vida corta (el usuario vuelve a iniciar sesión a menudo) y una vida larga (si roban el token, sirve por más tiempo).
- **API Key** en el header `x-api-key`. No hay usuarios: el frontend tendría que exponer la clave y el historial no tendría un usuario real.
- **Keycloak (OIDC)**, un proveedor de identidad externo. Es lo más robusto, pero suma un contenedor y bastante configuración para una prueba.

## Consecuencias

- **Positivas**:
  - El refresh token no es accesible desde JavaScript, lo que mitiga que se robe mediante XSS.
  - Cada cambio del historial queda asociado a un usuario autenticado.
  - Con la rotación, un refresh token robado sirve una sola vez.
- **Costos aceptados**:
  - Hay más piezas que mantener: rotación, revocación y protección CSRF del endpoint de refresh, porque el navegador envía la cookie automáticamente.
  - La rotación y la revocación obligan a registrar en la BD los refresh tokens emitidos. En ese punto, la autenticación tiene estado.

## Por definir en la implementación

Todo resuelto en el [ADR 0016](0016-autenticacion-sesiones-y-permisos.md):

- Access token de 15 min y sesión de 8 h.
- Argon2id para las contraseñas y JWT HS256.
- Roles ASESOR, ANALISTA, TESORERIA y ADMIN, con su matriz de permisos y las reglas de cuatro ojos.
- El access token vive solo en la memoria del frontend.
- Cookie `SameSite=Strict` con `Path=/api/auth`, más el header `X-CSRF`.
- Rate limit de login por IP y por IP + correo, más uno global.
- Usuarios demo creados con un script.

**Cambio respecto de este ADR:** se agregó la **sesión única** por usuario, y para garantizarla cada petición verifica en la BD que su sesión siga viva. La autenticación deja de ser sin estado en ese punto, a cambio de cortar las sesiones al instante.

Última actualización: 2026-10-01
