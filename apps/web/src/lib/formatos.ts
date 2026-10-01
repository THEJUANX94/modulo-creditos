// Formatos de la interfaz (ADR 0021): pesos colombianos y hora de Colombia.

const zonaHoraria = 'America/Bogota';

const pesosEnteros = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const pesosConCentavos = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// La API envía los montos como string exacto ("15000000.00"). Los centavos solo se muestran si
// existen. El monto no pasa por un número binario: la parte entera y la decimal se formatean por
// separado, así que "9999999999999999.99" se muestra exacto.
export function formatearMonto(monto: string): string {
  const [entera = '0', decimales = ''] = monto.split('.');
  const conCentavos = /[1-9]/.test(decimales);
  const formato = conCentavos ? pesosConCentavos : pesosEnteros;
  const enteroFormateado = formato
    .formatToParts(BigInt(entera))
    .map((parte) =>
      parte.type === 'fraction' ? decimales.padEnd(2, '0').slice(0, 2) : parte.value,
    )
    .join('');
  return enteroFormateado;
}

export function formatearTasa(tasa: string): string {
  return `${Number(tasa).toLocaleString('es-CO', { maximumFractionDigits: 4 })} % mensual`;
}

// "1 de oct de 2026": el mes en letras evita confundir el día con el mes.
const partesFecha = { day: 'numeric', month: 'short', year: 'numeric' } as const;
const fecha = new Intl.DateTimeFormat('es-CO', { timeZone: zonaHoraria, ...partesFecha });
const fechaHora = new Intl.DateTimeFormat('es-CO', {
  timeZone: zonaHoraria,
  ...partesFecha,
  hour: 'numeric',
  minute: '2-digit',
});

export const formatearFecha = (iso: string) => fecha.format(new Date(iso));
export const formatearFechaHora = (iso: string) => fechaHora.format(new Date(iso));

// El día de hoy en Colombia (AAAA-MM-DD), para los filtros de fecha.
export const hoyEnColombia = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: zonaHoraria }).format(new Date());

// Campo de monto: el usuario escribe "15.000.000,5"; a la API viaja "15000000.5".
// Solo dígitos y una coma decimal; los puntos son separadores de miles.
export function montoDesdeCampo(texto: string): string {
  const limpio = texto.replace(/\s|\$|\./g, '').replace(',', '.');
  return limpio;
}

// Lo que muestra el campo mientras se escribe: separadores de miles y la coma decimal tal cual.
export function montoParaCampo(texto: string): string {
  const [entera = '', ...resto] = texto.replace(/[^\d,]/g, '').split(',');
  const miles = entera.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return resto.length ? `${miles},${resto.join('').slice(0, 2)}` : miles;
}
