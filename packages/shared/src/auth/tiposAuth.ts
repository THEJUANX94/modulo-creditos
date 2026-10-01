import type { Rol } from './roles';

export interface UsuarioSesion {
  id: string;
  correo: string;
  nombre: string;
  rol: Rol;
  debeCambiarContrasena: boolean;
}

// Respuesta de login, refresh y cambio de contraseña. El refresh token viaja aparte, en la cookie httpOnly.
export interface RespuestaSesion {
  accessToken: string;
  expiraEn: string;
  usuario: UsuarioSesion;
}

export interface Usuario extends UsuarioSesion {
  activo: boolean;
  fechaCreacion: string;
}
