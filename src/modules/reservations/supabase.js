/**
 * modules/reservations/supabase.js
 *
 * Único punto donde el módulo agarra el cliente de Supabase.
 *
 * El proyecto exporta el cliente desde `config/supabaseClient.js`, pero el
 * nombre del export cambió a lo largo de las versiones (`supabase`,
 * `supabaseClient`, `client`, o default). En vez de adivinar, se importa el
 * namespace entero y se toma el que exista: así el módulo compila con
 * cualquiera de las variantes y, si mañana cambia, se toca solo este archivo.
 */
import * as configCliente from '../../config/supabaseClient.js';

export const supabase =
  configCliente.supabase ??
  configCliente.supabaseClient ??
  configCliente.client ??
  configCliente.default;

export const EDGE_FUNCTION_URL = configCliente.EDGE_FUNCTION_URL ?? '';

if (!supabase) {
  console.error(
    '[reservas] No se encontró el cliente de Supabase en config/supabaseClient.js. ' +
      'Revisá con qué nombre lo exporta y agregalo en modules/reservations/supabase.js.'
  );
}
