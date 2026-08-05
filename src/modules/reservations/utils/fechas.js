/**
 * modules/reservations/utils/fechas.js
 *
 * Todo el tiempo del módulo se calcula en la zona horaria del NEGOCIO
 * (negocio_config.zona_horaria), nunca con el reloj del navegador. Un
 * celular con la zona mal configurada, o un cliente de viaje, veía
 * horarios que no existían.
 */

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DIAS_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** 'YYYY-MM-DD' de hoy en la zona del negocio. */
export function hoyISO(zona) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Minutos transcurridos hoy (0–1439) en la zona del negocio. */
export function minutosDeAhora(zona) {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: zona,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(partes.find((p) => p.type === 'hour').value);
  const m = Number(partes.find((p) => p.type === 'minute').value);
  return h * 60 + m;
}

/** Suma días a un 'YYYY-MM-DD' sin pasar por Date local (evita corrimientos por DST). */
export function sumarDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  const base = Date.UTC(a, m - 1, d);
  const nuevo = new Date(base + dias * 86400000);
  return nuevo.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado, para cruzar con horarios_semanales.dia_semana. */
export function diaDeSemana(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export function nombreDiaCorto(iso) {
  return DIAS_CORTOS[diaDeSemana(iso)];
}

export function nombreDiaLargo(iso) {
  return DIAS_LARGOS[diaDeSemana(iso)];
}

export function numeroDia(iso) {
  return Number(iso.slice(8, 10));
}

export function nombreMesCorto(iso) {
  return MESES[Number(iso.slice(5, 7)) - 1];
}

/** 'Martes 12 de Ago' — para el resumen y la tarjeta de seguimiento. */
export function fechaLegible(iso) {
  return `${nombreDiaLargo(iso)} ${numeroDia(iso)} de ${nombreMesCorto(iso)}`;
}

/** '09:30' → 570 */
export function aMinutos(hhmm) {
  const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

/** 570 → '09:30' */
export function aHora(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Divide el día en franjas legibles para agrupar los horarios en la UI. */
export function franjaDelDia(minutos) {
  if (minutos < 12 * 60) return 'Mañana';
  if (minutos < 17 * 60) return 'Tarde';
  return 'Noche';
}
