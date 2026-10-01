import { z } from 'zod';
import { esquemaPaginacion } from '../http/paginacion';
import { estadosConObservacion, estadosCredito, estadosDestino } from './estadosCredito';

// ───────────── Piezas ─────────────

interface OpcionesDecimal {
  campo: string;
  decimales: number;
  maxEnteros: number;
  mayorQueCero: boolean;
  mensajeRango: string;
}

// Montos y tasas: aceptan número (como el ejemplo del enunciado) o string (exacto), y salen como
// string normalizado ("15000000.00"). Nunca se redondea en silencio: más decimales de los
// permitidos es un error (ADR 0017).
function esquemaDecimal(opciones: OpcionesDecimal) {
  return z.union([z.number(), z.string()]).transform((valor, ctx) => {
    const texto = typeof valor === 'number' ? String(valor) : valor.trim();
    const fallar = (mensaje: string) => {
      ctx.addIssue({ code: 'custom', message: mensaje });
      return z.NEVER;
    };

    if (texto.startsWith('-')) return fallar(opciones.mensajeRango);
    if (!/^\d+(\.\d+)?$/.test(texto)) {
      return fallar(`${opciones.campo} debe ser un número sin signo ni exponente`);
    }

    const [entera = '', fraccion = ''] = texto.split('.');
    if (fraccion.length > opciones.decimales) {
      return fallar(`${opciones.campo} admite como máximo ${opciones.decimales} decimales`);
    }
    const enteraSinCeros = entera.replace(/^0+(?=\d)/, '');
    if (enteraSinCeros.length > opciones.maxEnteros) return fallar(opciones.mensajeRango);

    const normalizado = `${enteraSinCeros}.${fraccion.padEnd(opciones.decimales, '0')}`;
    if (opciones.mayorQueCero && /^0\.0+$/.test(normalizado)) return fallar(opciones.mensajeRango);
    return normalizado;
  });
}

// DECIMAL(18,2): hasta 16 dígitos enteros.
export const esquemaValorSolicitado = esquemaDecimal({
  campo: 'El valor solicitado',
  decimales: 2,
  maxEnteros: 16,
  mayorQueCero: true,
  mensajeRango: 'El valor solicitado debe ser mayor que 0',
}).meta({
  description: 'Valor solicitado en pesos. Número o string, hasta 2 decimales',
  example: 15000000,
});

// DECIMAL(6,4), % mensual: de 0 a 99.9999.
export const esquemaTasaInteres = esquemaDecimal({
  campo: 'La tasa de interés',
  decimales: 4,
  maxEnteros: 2,
  mayorQueCero: false,
  mensajeRango: 'La tasa de interés debe estar entre 0 y 99.9999 (% mensual)',
}).meta({
  description: 'Tasa de interés en % mensual (1.5 = 1,5 % mes vencido). Hasta 4 decimales',
  example: 1.5,
});

export const esquemaNumeroCuotas = z
  .number({ error: 'El número de cuotas debe ser un número' })
  .int('El número de cuotas debe ser un entero')
  .min(1, 'El número de cuotas debe ser mayor que 0')
  .max(360, 'El número de cuotas puede ser como máximo 360')
  .meta({ description: 'Cuotas mensuales, de 1 a 360', example: 36 });

// Códigos de catálogo. Que existan y estén activos lo verifica el service contra la BD.
function esquemaCodigo(descripcion: string, ejemplo: string) {
  return z
    .string({ error: 'Es obligatorio' })
    .trim()
    .toUpperCase()
    .min(1, 'Es obligatorio')
    .max(30, 'Puede tener como máximo 30 caracteres')
    .meta({ description: descripcion, example: ejemplo });
}

const esquemaTipoCredito = esquemaCodigo('Código de TiposCredito', 'LIBRE_INVERSION');
const esquemaFormaPago = esquemaCodigo('Código de FormasPago', 'NOMINA');

function esquemaTextoLibre(maximo: number) {
  return z
    .string()
    .trim()
    .min(1, 'No puede estar vacío')
    .max(maximo, `Puede tener como máximo ${maximo} caracteres`);
}

export const esquemaVersion = z
  .string({ error: 'La versión es obligatoria' })
  .regex(/^0x[0-9A-Fa-f]{16}$/, 'La versión no es válida')
  .meta({
    description: 'ROWVERSION del crédito tal como lo devolvió la API (concurrencia optimista)',
    example: '0x00000000000007E1',
  });

// ───────────── Crear ─────────────

// Formato de la identificación por tipo, igual que CK_Asociados_identificacion.
const tiposSoloDigitos = ['CC', 'NIT'];

const camposIdentificacion = {
  tipoIdentificacionAsociado: z
    .string()
    .trim()
    .toUpperCase()
    .default('CC')
    .meta({ description: 'Código de TiposIdentificacion', example: 'CC' }),
  identificacionAsociado: z
    .string({ error: 'La identificación es obligatoria' })
    .trim()
    .min(3, 'La identificación debe tener al menos 3 caracteres')
    .max(20, 'La identificación puede tener como máximo 20 caracteres')
    .meta({ example: '1001234567' }),
};
const esquemaIdentificacion = z.object(camposIdentificacion);

export const esquemaCrearCredito = z
  .object({
    ...camposIdentificacion,
    // Se recortan los extremos y se colapsan los espacios internos antes de guardar y comparar.
    nombreAsociado: z
      .string({ error: 'El nombre del asociado es obligatorio' })
      .transform((nombre) => nombre.trim().replace(/\s+/g, ' '))
      .pipe(
        z
          .string()
          .min(1, 'El nombre del asociado es obligatorio')
          .max(150, 'El nombre puede tener como máximo 150 caracteres'),
      )
      .meta({ example: 'Juan Perez' }),
    tipoCredito: esquemaTipoCredito,
    valorSolicitado: esquemaValorSolicitado,
    tasaInteres: esquemaTasaInteres,
    numeroCuotas: esquemaNumeroCuotas,
    formaPago: esquemaFormaPago,
  })
  .superRefine(
    (datos, ctx) => {
      const soloDigitos = tiposSoloDigitos.includes(datos.tipoIdentificacionAsociado);
      const formato = soloDigitos ? /^\d+$/ : /^[0-9A-Za-z]+$/;
      if (!formato.test(datos.identificacionAsociado)) {
        ctx.addIssue({
          code: 'custom',
          path: ['identificacionAsociado'],
          message: soloDigitos
            ? `Con tipo ${datos.tipoIdentificacionAsociado} la identificación solo admite dígitos`
            : 'La identificación solo admite letras y números',
        });
      }
      // Corre aunque otros campos fallen: así el formulario muestra este error al salir del campo,
      // y no solo cuando todo lo demás está bien.
    },
    { when: (carga) => esquemaIdentificacion.safeParse(carga.value).success },
  )
  .meta({ id: 'CrearCredito' });

// ───────────── Editar ─────────────

export const camposEditables = [
  'tipoCredito',
  'valorSolicitado',
  'tasaInteres',
  'numeroCuotas',
  'formaPago',
] as const;

export type CampoEditable = (typeof camposEditables)[number];

export const esquemaEditarCredito = z
  .object({
    tipoCredito: esquemaTipoCredito.optional(),
    valorSolicitado: esquemaValorSolicitado.optional(),
    tasaInteres: esquemaTasaInteres.optional(),
    numeroCuotas: esquemaNumeroCuotas.optional(),
    formaPago: esquemaFormaPago.optional(),
    motivo: esquemaTextoLibre(500)
      .optional()
      .meta({ description: 'Por qué se edita. Opcional; queda en el historial' }),
    version: esquemaVersion,
  })
  .refine((datos) => camposEditables.some((campo) => datos[campo] !== undefined), {
    error: `Envíe al menos uno de: ${camposEditables.join(', ')}`,
    path: ['(cuerpo)'],
  })
  .meta({ id: 'EditarCredito' });

// ───────────── Cambiar estado ─────────────

export const esquemaCambiarEstado = z
  .object({
    estado: z.enum(estadosDestino, {
      error: `El estado debe ser uno de: ${estadosDestino.join(', ')}`,
    }),
    observacion: esquemaTextoLibre(500)
      .optional()
      .meta({ description: 'Obligatoria al rechazar o cancelar (el motivo)' }),
    version: esquemaVersion,
  })
  .refine((datos) => !estadosConObservacion.includes(datos.estado) || datos.observacion, {
    error: 'La observación es obligatoria al rechazar o cancelar',
    path: ['observacion'],
  })
  .meta({ id: 'CambiarEstadoCredito' });

// ───────────── Eliminar ─────────────

export const esquemaEliminarCredito = z
  .object({
    motivo: esquemaTextoLibre(500).meta({ description: 'Por qué se elimina. Obligatorio' }),
    version: esquemaVersion,
  })
  .meta({ id: 'EliminarCredito' });

// ───────────── Listar ─────────────

export const ordenesCredito = [
  'fechaSolicitud',
  'valorSolicitado',
  'numeroCredito',
  'nombreAsociado',
  'estado',
] as const;

// ?estado=SOLICITADO,EN_ESTUDIO o ?estado=SOLICITADO&estado=EN_ESTUDIO
const esquemaListaEstados = z
  .union([z.string(), z.array(z.string())])
  .transform((valor) =>
    (Array.isArray(valor) ? valor : valor.split(','))
      .map((estado) => estado.trim().toUpperCase())
      .filter(Boolean),
  )
  .pipe(z.array(z.enum(estadosCredito, { error: 'Estado no válido' })).min(1));

export const esquemaFiltrosCreditos = esquemaPaginacion
  .extend({
    estado: esquemaListaEstados
      .optional()
      .meta({ description: 'Uno o varios estados separados por coma' }),
    identificacion: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .optional()
      .meta({ description: 'Identificación exacta del asociado' }),
    tipoCredito: esquemaTipoCredito.optional(),
    formaPago: esquemaFormaPago.optional(),
    fechaDesde: z.iso
      .date({ error: 'Use el formato AAAA-MM-DD' })
      .optional()
      .meta({ description: 'Día de solicitud desde (hora de Colombia), inclusive' }),
    fechaHasta: z.iso
      .date({ error: 'Use el formato AAAA-MM-DD' })
      .optional()
      .meta({ description: 'Día de solicitud hasta (hora de Colombia), inclusive' }),
    busqueda: z
      .string()
      .trim()
      .min(2, 'La búsqueda necesita al menos 2 caracteres')
      .max(100)
      .optional()
      .meta({
        description: 'Contiene, en número de crédito, identificación o nombre (sin tildes)',
      }),
    ordenarPor: z.enum(ordenesCredito).default('fechaSolicitud'),
    orden: z.enum(['asc', 'desc']).default('desc'),
    incluirEliminados: z
      .enum(['true', 'false'])
      .default('false')
      .transform((valor) => valor === 'true')
      .meta({ description: 'Solo ADMIN' }),
  })
  .refine(
    (filtros) =>
      !filtros.fechaDesde || !filtros.fechaHasta || filtros.fechaDesde <= filtros.fechaHasta,
    { error: 'fechaDesde no puede ser posterior a fechaHasta', path: ['fechaDesde'] },
  );

export type DatosCrearCredito = z.infer<typeof esquemaCrearCredito>;
export type DatosEditarCredito = z.infer<typeof esquemaEditarCredito>;
export type DatosCambiarEstado = z.infer<typeof esquemaCambiarEstado>;
export type DatosEliminarCredito = z.infer<typeof esquemaEliminarCredito>;
export type FiltrosCreditos = z.infer<typeof esquemaFiltrosCreditos>;
