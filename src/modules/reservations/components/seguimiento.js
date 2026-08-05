/**
 * modules/reservations/components/seguimiento.js
 *
 * Estado del turno enviado. Dos superficies:
 *  - la tarjeta dentro de la hoja (cuando el cliente la abre)
 *  - el aviso flotante abajo, visible mientras navega el resto del sitio
 *
 * Detalle importante: la tarjeta pinta el estado REAL que recibe. La
 * versión anterior terminaba siempre forzando "pendiente", así que un
 * cliente que volvía al sitio con el turno ya confirmado veía "pendiente"
 * hasta que llegara un evento de Realtime.
 */
import { fechaLegible } from '../utils/fechas.js';

const gs = (n) => new Intl.NumberFormat('es-PY').format(Number(n) || 0);

export const ESTADOS = {
  pendiente: {
    etiqueta: 'Pendiente de confirmación',
    corta: 'Pendiente',
    detalle: 'El barbero todavía no respondió tu solicitud.',
    icono: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  },
  confirmado: {
    etiqueta: 'Turno confirmado',
    corta: 'Confirmado',
    detalle: 'Te esperamos. Llegá cinco minutos antes.',
    icono: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  },
  cancelado: {
    etiqueta: 'Turno cancelado',
    corta: 'Cancelado',
    detalle: 'Podés pedir otro horario cuando quieras.',
    icono: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
  },
  rechazado: {
    etiqueta: 'Solicitud rechazada',
    corta: 'Rechazada',
    detalle: 'Ese horario no quedó disponible. Probá con otro.',
    icono: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
  },
};

export function estiloDe(estado) {
  return ESTADOS[estado] || ESTADOS.pendiente;
}

export function tarjetaSeguimiento(turno) {
  const e = estiloDe(turno.estado);
  const servicios = (turno.servicios || []).map((s) => s.nombre).join(' + ');

  return `
    <div class="rsv-seg rsv-seg--${turno.estado}" data-rsv-seg>
      <span class="rsv-seg__aro" aria-hidden="true">
        <svg viewBox="0 0 24 24">${e.icono}</svg>
      </span>
      <p class="rsv-seg__estado">${e.etiqueta}</p>
      <p class="rsv-seg__detalle">${turno.motivo_cancelacion || e.detalle}</p>

      <dl class="rsv-seg__datos">
        <div><dt>Servicio</dt><dd>${servicios || '—'}</dd></div>
        <div><dt>Día</dt><dd>${fechaLegible(turno.fecha)}</dd></div>
        <div><dt>Hora</dt><dd>${turno.hora}</dd></div>
        <div><dt>Total</dt><dd>${gs(turno.total)} Gs</dd></div>
      </dl>

      <div class="rsv-seg__acciones">
        <button type="button" class="rsv__cta rsv__cta--fantasma" data-rsv-nueva>Reservar otro turno</button>
        ${
          turno.estado === 'pendiente' || turno.estado === 'confirmado'
            ? '<button type="button" class="rsv-seg__cancelar" data-rsv-cancelar>Cancelar este turno</button>'
            : ''
        }
      </div>
    </div>`;
}
