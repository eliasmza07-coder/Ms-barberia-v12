/**
 * modules/reservations/index.js
 *
 * Única puerta de entrada del módulo. El resto de la app solo importa
 * desde acá — nunca de un archivo interno. Así el día que quieras
 * reemplazar el flujo entero, el contrato sigue siendo el mismo.
 *
 *   import { montarReservas } from './modules/reservations/index.js';
 *   montarReservas(document.getElementById('reservas'));
 */
import './reservations.css';
import { ReservationsController } from './reservations.controller.js';

export function montarReservas(contenedor, opciones = {}) {
  if (!contenedor) {
    console.warn('[reservas] no se encontró el contenedor donde montar el módulo');
    return null;
  }
  ReservationsController.montar(contenedor, opciones);
  return {
    abrir: ReservationsController.abrir,
    cerrar: ReservationsController.cerrar,
    desmontar: ReservationsController.desmontar,
  };
}

export { ReservationsController };
