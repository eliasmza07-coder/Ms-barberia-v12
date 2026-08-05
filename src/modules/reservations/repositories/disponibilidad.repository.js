/**
 * modules/reservations/repositories/disponibilidad.repository.js
 *
 * Única capa que habla con Supabase para saber qué está abierto y qué está
 * ocupado. Trae TODA la ventana (5–7 días) en un puñado de consultas fijas,
 * no una por día: con 7 días eso serían 35 idas y vueltas contra 5.
 *
 * Convive con los dos esquemas de horarios que hay hoy en la base:
 *   nuevo  → horarios_semanales + excepciones_horario + bloqueos
 *   legacy → config_jornada + dias_libres + horas_bloqueadas
 * Ver FUENTE_HORARIOS en reservations.config.js.
 */
import { supabase } from '../supabase.js';
import { FUENTE_HORARIOS, ESTADOS_OCUPAN } from '../reservations.config.js';
import { aMinutos } from '../utils/fechas.js';

let fuenteDetectada = null;

/** Prueba una vez si el esquema nuevo tiene datos; el resultado se cachea. */
async function resolverFuente(negocioId) {
  if (FUENTE_HORARIOS !== 'auto') return FUENTE_HORARIOS;
  if (fuenteDetectada) return fuenteDetectada;

  const { data, error } = await supabase
    .from('horarios_semanales')
    .select('id')
    .eq('negocio_id', negocioId)
    .eq('activo', true)
    .limit(1);

  fuenteDetectada = !error && data && data.length > 0 ? 'nuevo' : 'legacy';
  return fuenteDetectada;
}

export const DisponibilidadRepository = {
  /** Config del negocio + su id. Si no hay fila, el service aplica los defaults. */
  async cargarNegocio(slug) {
    let negocio = null;
    const consulta = supabase.from('negocios').select('id, nombre, slug, activo');
    const { data } = slug
      ? await consulta.eq('slug', slug).maybeSingle()
      : await consulta.limit(1).maybeSingle();
    negocio = data || null;
    if (!negocio) return { negocio: null, config: null };

    const { data: config } = await supabase
      .from('negocio_config')
      .select('*')
      .eq('negocio_id', negocio.id)
      .maybeSingle();

    return { negocio, config: config || null };
  },

  /**
   * Ventanas de atención por fecha para todo el rango.
   * @returns {Promise<Object>} { 'YYYY-MM-DD': [{ inicio, fin }] } en minutos
   */
  async ventanasPorFecha(negocioId, fechas) {
    const fuente = await resolverFuente(negocioId);
    return fuente === 'nuevo'
      ? this._ventanasNuevo(negocioId, fechas)
      : this._ventanasLegacy(negocioId, fechas);
  },

  async _ventanasNuevo(negocioId, fechas) {
    const desde = fechas[0];
    const hasta = fechas[fechas.length - 1];

    const [semanales, excepciones] = await Promise.all([
      supabase
        .from('horarios_semanales')
        .select('dia_semana, hora_inicio, hora_fin, activo')
        .eq('negocio_id', negocioId)
        .eq('activo', true),
      supabase
        .from('excepciones_horario')
        .select('fecha_desde, fecha_hasta, tipo, hora_inicio, hora_fin')
        .eq('negocio_id', negocioId)
        .lte('fecha_desde', hasta)
        .gte('fecha_hasta', desde),
    ]);

    const porDiaSemana = {};
    (semanales.data || []).forEach((h) => {
      (porDiaSemana[h.dia_semana] ||= []).push({
        inicio: aMinutos(h.hora_inicio),
        fin: aMinutos(h.hora_fin),
      });
    });

    return { porDiaSemana, excepciones: excepciones.data || [] };
  },

  async _ventanasLegacy(negocioId, fechas) {
    const desde = fechas[0];
    const hasta = fechas[fechas.length - 1];

    const [jornada, diasLibres] = await Promise.all([
      supabase.from('config_jornada').select('apertura, cierre, intervalo').limit(1).maybeSingle(),
      supabase.from('dias_libres').select('fecha').gte('fecha', desde).lte('fecha', hasta),
    ]);

    const j = jornada.data || { apertura: 7, cierre: 20 };
    const ventana = [{ inicio: Number(j.apertura) * 60, fin: Number(j.cierre) * 60 }];
    const porDiaSemana = {};
    for (let d = 0; d <= 6; d += 1) porDiaSemana[d] = ventana;

    // Los días libres del esquema viejo se expresan como excepciones "cerrado"
    // para que el service trate a los dos esquemas exactamente igual.
    const excepciones = (diasLibres.data || []).map((d) => ({
      fecha_desde: d.fecha,
      fecha_hasta: d.fecha,
      tipo: 'cerrado',
      hora_inicio: null,
      hora_fin: null,
    }));

    return { porDiaSemana, excepciones, intervaloLegacy: j.intervalo || null };
  },

  /**
   * Todo lo que ocupa lugar en el rango: turnos vivos, bloqueos manuales y
   * reservas temporales que todavía no vencieron.
   * @returns {Promise<Object>} { 'YYYY-MM-DD': [{ inicio, fin }] } en minutos
   */
  async ocupadosPorFecha(negocioId, fechas) {
    const desde = fechas[0];
    const hasta = fechas[fechas.length - 1];
    const ahora = new Date().toISOString();

    const [turnos, bloqueos, temporales, horasBloqueadas] = await Promise.all([
      supabase
        .from('turnos')
        .select('fecha, hora, duracion_min, margen_antes_min, margen_despues_min, estado')
        .eq('negocio_id', negocioId)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .in('estado', ESTADOS_OCUPAN),
      supabase
        .from('bloqueos')
        .select('fecha, hora_inicio, hora_fin')
        .eq('negocio_id', negocioId)
        .gte('fecha', desde)
        .lte('fecha', hasta),
      supabase
        .from('reservas_temporales')
        .select('fecha, hora, duracion_min, margen_antes_min, margen_despues_min')
        .eq('negocio_id', negocioId)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .gt('expira_en', ahora),
      supabase
        .from('horas_bloqueadas')
        .select('fecha, hora')
        .gte('fecha', desde)
        .lte('fecha', hasta),
    ]);

    const mapa = {};
    const agregar = (fecha, inicio, fin) => {
      (mapa[fecha] ||= []).push({ inicio, fin });
    };

    (turnos.data || []).concat(temporales.data || []).forEach((t) => {
      const inicio = aMinutos(t.hora) - (t.margen_antes_min || 0);
      const fin = aMinutos(t.hora) + (t.duracion_min || 30) + (t.margen_despues_min || 0);
      agregar(t.fecha, inicio, fin);
    });

    (bloqueos.data || []).forEach((b) => {
      agregar(b.fecha, aMinutos(b.hora_inicio), aMinutos(b.hora_fin));
    });

    // Esquema viejo: una hora bloqueada suelta ocupa esa hora entera.
    (horasBloqueadas.data || []).forEach((h) => {
      const inicio = aMinutos(h.hora);
      agregar(h.fecha, inicio, inicio + 60);
    });

    return mapa;
  },
};
