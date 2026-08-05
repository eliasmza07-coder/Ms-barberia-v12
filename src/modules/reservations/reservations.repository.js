/**
 * modules/reservations/reservations.repository.js
 * Acceso a la tabla `turnos` (mismo nombre que en producción). La CREACIÓN
 * de una reserva NO pasa por acá: el proyecto original la delega a una
 * Supabase Edge Function (`gestionar-reserva`) — ver reservations.service.js.
 * Este repository cubre lectura, cambio de estado y borrado, igual que
 * liberarTurno / cambiarEstadoTurno / cargarHistorialGeneral originales.
 */
import { BaseRepository } from '../../shared/repositories/BaseRepository.js';

class ReservationsRepository extends BaseRepository {
  constructor() {
    super('turnos');
  }

  async porFecha(fecha) {
    return this.client.from(this.table).select('*').eq('fecha', fecha).neq('estado', 'cancelado');
  }

  /** Igual que porFecha, pero incluye canceladas — para las estadísticas del Dashboard. */
  async porFechaTodos(fecha) {
    return this.client.from(this.table).select('*').eq('fecha', fecha);
  }

  /** Ubica el turno recién creado por la Edge Function (que no devuelve el id) para poder seguirlo. */
  async buscarPorFechaHoraTelefono(fecha, hora, telefono) {
    return this.client
      .from(this.table)
      .select('*')
      .eq('fecha', fecha)
      .eq('hora', hora)
      .eq('cliente_telefono', telefono)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  async historialCompleto() {
    return this.client
      .from(this.table)
      .select('*')
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false });
  }

  async cambiarEstado(id, nuevoEstado) {
    return this.update(id, { estado: nuevoEstado });
  }

  async liberar(id) {
    return this.remove(id);
  }
}

export const reservationsRepository = new ReservationsRepository();
