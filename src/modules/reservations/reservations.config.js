/**
 * modules/reservations/reservations.config.js
 *
 * Único lugar donde se tocan las decisiones que dependen del estado real
 * del backend. Si algo del módulo hay que adaptar al proyecto, se toca acá
 * y no adentro de la lógica.
 */

/**
 * De dónde salen los horarios de atención.
 *
 *  'auto'   → intenta el esquema nuevo (horarios_semanales / excepciones_horario /
 *             bloqueos); si no hay filas o la tabla no existe, cae al viejo.
 *  'nuevo'  → fuerza horarios_semanales + excepciones_horario + bloqueos.
 *  'legacy' → fuerza config_jornada + dias_libres + horas_bloqueadas.
 *
 * Queda en 'auto' porque todavía no confirmamos cuál manda en producción.
 * Cuando lo sepas, ponelo fijo: ahorra una consulta por carga.
 */
export const FUENTE_HORARIOS = 'auto';

/**
 * Cómo se crea el turno.
 *
 *  'edge-function' → POST a gestionar-reserva (lo que hace el proyecto hoy).
 *  'directo'       → insert en `turnos` + `turno_servicios` desde el cliente.
 *                    Requiere políticas RLS de insert para anon.
 *
 * El insert directo es el único que soporta varios servicios por turno de
 * punta a punta. Si la Edge Function todavía no acepta un array de
 * servicios ni devuelve el token, dejá esto en 'directo'.
 */
export const MODO_CREACION = 'edge-function';

/** Valores por defecto si `negocio_config` no trae la fila o le falta un campo. */
export const CONFIG_POR_DEFECTO = {
  zona_horaria: 'America/Asuncion',
  intervalo_slot_min: 15,
  margen_antes_min: 0,
  margen_despues_min: 10,
  anticipacion_min_min: 30,
  anticipacion_max_dias: 7,
  limite_cancelacion_horas: 4,
  hold_minutos: 8,
  confirmacion_automatica: false,
  max_faltas_alerta: 3,
};

/** Tope de servicios que se pueden combinar en un mismo turno. */
export const MAX_SERVICIOS_POR_TURNO = 3;

/** Estados de `turnos` que ocupan un horario (no se pueden reservar encima). */
export const ESTADOS_OCUPAN = ['pendiente', 'confirmado'];

/** Clave de localStorage donde se guarda el turno que el cliente está siguiendo. */
export const CLAVE_SEGUIMIENTO = 'ms_turno_seguimiento';
