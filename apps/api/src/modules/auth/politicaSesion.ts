// Política de sesión (ADR 0016). Es una decisión de seguridad, no un parámetro de entorno.
export const duracionAccessTokenMs = 15 * 60 * 1000;

// Una jornada de trabajo: cada día empieza con login. La rotación no la extiende.
export const duracionSesionMs = 8 * 60 * 60 * 1000;

// Un refresh token rotado hace menos de esto se acepta una vez más sin tratarlo como robo:
// cubre dos pestañas que refrescan al mismo tiempo.
export const graciaReusoRefreshMs = 10 * 1000;
