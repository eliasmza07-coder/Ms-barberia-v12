/**
 * modules/reservations/repositories/turnos.repository.js
 *
 * Acceso a `turnos`, `turno_servicios`, `reservas_temporales` y `clientes`.
 *
 * Ojo con `obtenerPorToken`: devuelve { ok, turno }. Antes el código
 * asumía que "no vino nada" significaba "el barbero canceló el turno", así
 * que un corte de red o una política RLS le mostraba al cliente "Turno
 * cancelado" cuando su turno estaba perfecto. Ausencia y error NO son lo
 * mismo y acá se distinguen.
 */
import { supabase } from '../../../config/supabaseClient.js';

export const TurnosRepository = {
  /** Servicios activos del negocio, en el orden que definió el barbero. */
  async catalogo(negocioId) {
    const { data, error } = await supabase
      .from('servicios')
      .select('id, nombre, precio, duracion, desc, imagen_url, margen_antes_min, margen_despues_min')
      .eq('negocio_id', negocioId)
      .eq('activo', true)
      .order('orden', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  /** Inserta el turno y sus servicios. Solo se usa con MODO_CREACION = 'directo'. */
  async crear(turno, servicios) {
    const { data, error } = await supabase.from('turnos').insert(turno).select().single();
    if (error) throw error;

    if (servicios.length) {
      const filas = servicios.map((s, i) => ({
        turno_id: data.id,
        servicio_id: s.id,
        nombre: s.nombre,
        precio: s.precio,
        duracion_min: s.duracion,
        orden: i,
      }));
      const { error: errS } = await supabase.from('turno_servicios').insert(filas);
      if (errS) throw errS;
    }
    return data;
  },

  /**
   * Estado actual del turno seguido.
   * @returns {Promise<{ok: boolean, turno: object|null}>}
   *   ok=false → no se pudo leer (red/RLS). No concluir nada del estado.
   *   ok=true, turno=null → la fila ya no existe: ahí sí fue cancelado.
   */
  async obtenerPorToken(token) {
    // Vía preferida: la función `estado_turno` (ver SQL_MODULO_RESERVAS.sql).
    // Devuelve solo la fila de ese token, así no hace falta abrirle `turnos`
    // entero a los visitantes anónimos.
    const rpc = await supabase.rpc('estado_turno', { p_token: token });
    if (!rpc.error) {
      const fila = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
      return { ok: true, turno: fila || null };
    }

    // Si la función todavía no está creada, se intenta el select directo.
    const { data, error } = await supabase
      .from('turnos')
      .select('id, estado, fecha, hora, motivo_cancelacion')
      .eq('token_seguimiento', token)
      .maybeSingle();
    if (error) return { ok: false, turno: null };
    return { ok: true, turno: data || null };
  },

  async cancelarPorToken(token, motivo) {
    const rpc = await supabase.rpc('cancelar_turno', { p_token: token, p_motivo: motivo });
    if (!rpc.error) return rpc;
    return supabase
      .from('turnos')
      .update({ estado: 'cancelado', motivo_cancelacion: motivo, cancelado_por: 'cliente' })
      .eq('token_seguimiento', token);
  },

  // ---------- Reserva temporal (hold) ----------

  /**
   * Aparta el horario mientras el cliente completa sus datos.
   * Es "mejor esfuerzo": si la tabla no está lista o RLS lo rechaza,
   * devolvemos null y el flujo sigue igual — no vale trabar una reserva
   * real por no poder crear un hold.
   */
  async crearHold({ negocioId, fecha, hora, duracion, margenAntes, margenDespues, minutos }) {
    const expira = new Date(Date.now() + minutos * 60000).toISOString();
    const { data, error } = await supabase
      .from('reservas_temporales')
      .insert({
        negocio_id: negocioId,
        fecha,
        hora,
        duracion_min: duracion,
        margen_antes_min: margenAntes,
        margen_despues_min: margenDespues,
        expira_en: expira,
      })
      .select('id, expira_en')
      .single();
    if (error) return null;
    return data;
  },

  async liberarHold(id) {
    if (!id) return;
    await supabase.from('reservas_temporales').delete().eq('id', id);
  },

  // ---------- Clientes ----------

  /** Busca al cliente por teléfono para autocompletar y detectar bloqueos. */
  async clientePorTelefono(negocioId, telefono) {
    const { data } = await supabase
      .from('clientes')
      .select('id, nombre, telefono, total_faltas, bloqueado')
      .eq('negocio_id', negocioId)
      .eq('telefono', telefono)
      .maybeSingle();
    return data || null;
  },
};
