import { z } from 'zod';

// Paginación común a todos los listados (ADR 0016): pagina desde 1, 20 por defecto, máximo 100.
// Un tamaño mayor que el máximo es un error, no se recorta en silencio.
export const tamanoPaginaMaximo = 100;

export const esquemaPaginacion = z.object({
  pagina: z.coerce
    .number({ error: 'La página debe ser un número' })
    .int('La página debe ser un entero')
    .min(1, 'La página empieza en 1')
    .default(1),
  tamanoPagina: z.coerce
    .number({ error: 'El tamaño de página debe ser un número' })
    .int('El tamaño de página debe ser un entero')
    .min(1, 'El tamaño de página mínimo es 1')
    .max(tamanoPaginaMaximo, `El tamaño de página máximo es ${tamanoPaginaMaximo}`)
    .default(20),
});

export type Paginacion = z.infer<typeof esquemaPaginacion>;
