// Contratos compartidos por la API, la web y el mock del webhook: esquemas Zod, tipos y catálogos.
// No usa APIs de Node ni del navegador, porque corre en ambos.
import './zodEspanol';

export * from './auth/esquemasAuth';
export * from './auth/permisos';
export * from './auth/roles';
export * from './auth/tiposAuth';
export * from './creditos/esquemasCreditos';
export * from './creditos/estadosCredito';
export * from './creditos/respuestasCreditos';
export * from './errores/codigosError';
export * from './http/paginacion';
export * from './http/respuestas';
