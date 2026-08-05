/**
 * modules/reservations/reservations.service.js
 *
 * Reglas de negocio del módulo. No toca el DOM ni Supabase directamente:
 * pide datos a los repositories y devuelve estructuras listas para pintar.
 *
 * Decisiones que valen la pena tener a mano:
 *  - Los márgenes de limpieza se aplican UNA VEZ al turno completo, no por
 *    servicio. Sumarlos por cada corte elegido inflaba la duración y hacía
 *    desaparecer horarios que en realidad estaban libres.
 *  - Todo se calcula en la zona horaria del negocio.
 *  - Un día solo entra en la lista si tiene al menos un hueco real para la
 *    combinación de servicios elegida.
 */
import { DisponibilidadRepository } from './repositories/disponibilidad.repository.js';
import { TurnosRepository } from './repositories/turnos.repository.js';
import { supabase, EDGE_FUNCTION_URL } from './supabase.js';
import { env } from '../../config/env.js';
import { CONFIG_POR_DEFECTO, MODO_CREACION } from './reservations.config.js';
import { hoyISO, minutosDeAhora, sumarDias, diaDeSemana, aMinutos, aHora, franjaDelDia } from './utils/fechas.js';

/** Une intervalos que se pisan para que el chequeo de choques sea más barato. */
function fusionar(intervalos) {
  if (!intervalos.length) return [];
  const orden = [...intervalos].sort((a, b) => a.inicio - b.inicio);
  const salida = [orden[0]];
  for (let i = 1; i < orden.length; i += 1) {
    const ultimo = salida[salida.length - 1];
    if (orden[i].inicio <= ultimo.fin) ultimo.fin = Math.max(ultimo.fin, orden[i].fin);
    else salida.push({ ...orden[i] });
  }
  return salida;
}

/** Aplica las excepciones de una fecha sobre la ventana semanal base. */
function ventanasDelDia(fecha, porDiaSemana, excepciones) {
  const aplicables = excepciones.filter((e) => e.fecha_desde <= fecha && e.fecha_hasta >= fecha);

  // Cerrado gana sobre cualquier otra cosa.
  if (aplicables.some((e) => e.tipo === 'cerrado' || (!e.hora_inicio && !e.hora_fin))) return [];

  const especial = aplicables.find((e) => e.hora_inicio && e.hora_fin);
  if (especial) return [{ inicio: aMinutos(especial.hora_inicio), fin: aMinutos(especial.hora_fin) }];

  return porDiaSemana[diaDeSemana(fecha)] || [];
}

export const ReservationsService = {
  /** Trae negocio, config (con defaults aplicados) y catálogo de servicios. */
  async cargarContexto(slug) {
    const { negocio, config } = await DisponibilidadRepository.cargarNegocio(slug);
    if (!negocio) throw new Error('No se pudo cargar la información del negocio.');

    const cfg = { ...CONFIG_POR_DEFECTO, ...(config || {}) };
    const catalogo = await TurnosRepository.catalogo(negocio.id);
    return { negocioId: negocio.id, negocio, config: cfg, catalogo };
  },

  /**
   * Calcula la disponibilidad de toda la ventana de una sola vez.
   * @returns {Promise<{dias: Array, horasPorDia: Object}>}
   *   dias → [{ fecha, cantidad }] solo con los que tienen huecos.
   */
  async calcularVentana({ negocioId, config, servicios }) {
    const zona = config.zona_horaria;
    const hoy = hoyISO(zona);
    const dias = Number(config.anticipacion_max_dias) || 7;

    const fechas = [];
    for (let i = 0; i < dias; i += 1) fechas.push(sumarDias(hoy, i));

    const [horarios, ocupados] = await Promise.all([
      DisponibilidadRepository.ventanasPorFecha(negocioId, fechas),
      DisponibilidadRepository.ocupadosPorFecha(negocioId, fechas),
    ]);

    const duracion = servicios.reduce((t, s) => t + (s.duracion || 0), 0);
    // Márgenes: se toma el mayor declarado entre los servicios elegidos y el
    // del negocio, una sola vez para todo el turno.
    const margenAntes = Math.max(
      Number(config.margen_antes_min) || 0,
      ...servicios.map((s) => Number(s.margen_antes_min) || 0)
    );
    const margenDespues = Math.max(
      Number(config.margen_despues_min) || 0,
      ...servicios.map((s) => Number(s.margen_despues_min) || 0)
    );

    const intervalo = Number(horarios.intervaloLegacy || config.intervalo_slot_min) || 15;
    const anticipacion = Number(config.anticipacion_min_min) || 0;
    const ahora = minutosDeAhora(zona);

    const horasPorDia = {};
    const resumen = [];

    fechas.forEach((fecha) => {
      const ventanas = ventanasDelDia(fecha, horarios.porDiaSemana, horarios.excepciones);
      if (!ventanas.length) return;

      const choques = fusionar(ocupados[fecha] || []);
      // Si el día es hoy, no ofrecer nada antes de ahora + anticipación mínima.
      const pisoHoy = fecha === hoy ? ahora + anticipacion : -Infinity;

      const libres = [];
      ventanas.forEach((v) => {
        const primer = Math.ceil(v.inicio / intervalo) * intervalo;
        for (let t = primer; t + duracion <= v.fin; t += intervalo) {
          if (t < pisoHoy) continue;
          const desde = t - margenAntes;
          const hasta = t + duracion + margenDespues;
          const choca = choques.some((o) => desde < o.fin && hasta > o.inicio);
          if (!choca) libres.push(t);
        }
      });

      if (!libres.length) return;

      horasPorDia[fecha] = libres.sort((a, b) => a - b).map((m) => ({
        minutos: m,
        hora: aHora(m),
        franja: franjaDelDia(m),
      }));
      resumen.push({ fecha, cantidad: libres.length });
    });

    return { dias: resumen, horasPorDia, duracion, margenAntes, margenDespues };
  },

  /** Aparta el horario elegido mientras el cliente completa sus datos. */
  async apartarHorario({ negocioId, fecha, hora, duracion, margenAntes, margenDespues, config }) {
    return TurnosRepository.crearHold({
      negocioId,
      fecha,
      hora,
      duracion,
      margenAntes,
      margenDespues,
      minutos: Number(config.hold_minutos) || 8,
    });
  },

  async liberarHorario(holdId) {
    return TurnosRepository.liberarHold(holdId);
  },

  async buscarCliente(negocioId, telefono) {
    if (!telefono || telefono.length < 6) return null;
    return TurnosRepository.clientePorTelefono(negocioId, telefono);
  },

  /**
   * Crea el turno. Genera el token de seguimiento del lado del cliente para
   * no depender de que la Edge Function lo devuelva — con el token, seguir
   * el estado es una consulta directa y deja de hacer falta el viejo truco
   * de buscar el turno por fecha + hora + teléfono (que fallaba y dejaba el
   * seguimiento clavado en "pendiente" para siempre).
   */
  async crearTurno({ negocioId, fecha, hora, servicios, nombre, telefono, comentario, config, duracion, margenAntes, margenDespues, clienteId, clienteRefId }) {
    if (!servicios.length) throw new Error('Elegí al menos un servicio.');
    if (!fecha || !hora) throw new Error('Elegí un día y un horario.');
    if (!nombre.trim() || !telefono.trim()) throw new Error('Completá tu nombre y tu teléfono.');

    const token = crypto.randomUUID();
    const precio = servicios.reduce((t, s) => t + Number(s.precio || 0), 0);
    const estadoInicial = config.confirmacion_automatica ? 'confirmado' : 'pendiente';

    if (MODO_CREACION === 'directo') {
      const turno = await TurnosRepository.crear(
        {
          negocio_id: negocioId,
          fecha,
          hora,
          cliente_nombre: nombre.trim(),
          cliente_telefono: telefono.trim(),
          servicio_nombre: servicios.map((s) => s.nombre).join(' + '),
          precio,
          duracion_min: duracion,
          margen_antes_min: margenAntes,
          margen_despues_min: margenDespues,
          estado: estadoInicial,
          comentario: comentario?.trim() || null,
          origen: 'web',
          token_seguimiento: token,
          cliente_id: clienteId || null,
          cliente_ref_id: clienteRefId || null,
        },
        servicios
      );
      return { id: turno.id, token, estado: turno.estado };
    }

    // Edge Function: se le manda el array de servicios y el token. Si todavía
    // no los entiende, ignora los campos extra y el turno igual se crea —
    // pero entonces conviene pasar MODO_CREACION a 'directo'.
    const respuesta = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        negocio_id: negocioId,
        fecha,
        hora,
        cliente_nombre: nombre.trim(),
        cliente_telefono: telefono.trim(),
        servicio_nombre: servicios.map((s) => s.nombre).join(' + '),
        servicios: servicios.map((s, i) => ({
          servicio_id: s.id,
          nombre: s.nombre,
          precio: s.precio,
          duracion_min: s.duracion,
          orden: i,
        })),
        precio,
        duracion_min: duracion,
        margen_antes_min: margenAntes,
        margen_despues_min: margenDespues,
        comentario: comentario?.trim() || null,
        origen: 'web',
        token_seguimiento: token,
      }),
    });

    const resultado = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      throw new Error(resultado.error || 'No se pudo enviar la solicitud. Probá de nuevo.');
    }
    return { id: resultado.id ?? null, token, estado: resultado.estado || estadoInicial };
  },

  async estadoDelTurno(token) {
    return TurnosRepository.obtenerPorToken(token);
  },

  async cancelarTurno(token, motivo) {
    return TurnosRepository.cancelarPorToken(token, motivo);
  },

  /** Escucha cambios del turno seguido. Devuelve una función para desuscribir. */
  suscribirATurno(token, alCambiar) {
    const canal = supabase
      .channel(`turno-${token}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turnos', filter: `token_seguimiento=eq.${token}` },
        (payload) => alCambiar(payload)
      )
      .subscribe();
    return () => supabase.removeChannel(canal);
  },
};
