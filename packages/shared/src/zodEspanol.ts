import { z } from 'zod';

// Mensajes de Zod en español para los casos sin mensaje propio. Los esquemas de la API y de los
// formularios definen sus propios mensajes para los campos importantes.
z.config(z.locales.es());
