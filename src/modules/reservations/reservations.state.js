/**
 * modules/reservations/reservations.state.js
 *
 * Fuente única de verdad del wizard. Antes el estado vivía repartido entre
 * el `store` global, variables sueltas del controller y el propio DOM
 * (el value del input de fecha) — por eso era tan fácil "perder" la
 * selección al ir y volver entre pasos. Acá está todo en un solo objeto:
 * la UI se dibuja siempre a partir de esto, nunca al revés.
 */

export const PASOS = {
  SERVICIOS: 1,
  DIA: 2,
  HORA: 3,
  DATOS: 4,
  RESUMEN: 5,
};

export const TOTAL_PASOS = 5;

function estadoInicial() {
  return {
    paso: PASOS.SERVICIOS,

    // Configuración del negocio (negocio_config) y su id.
    negocioId: null,
    config: null,

    // Catálogo y selección
    catalogo: [],
    servicios: [], // servicios elegidos, en el orden en que los tocó

    // Disponibilidad ya calculada para toda la ventana
    dias: [], // [{ fecha, cantidad }] — solo días CON huecos
    horas: [], // [{ hora, minutos, franja }] del día elegido

    dia: null,
    hora: null,

    // Datos del cliente
    nombre: '',
    telefono: '',
    comentario: '',
    clienteConocido: null, // fila de `clientes` si el teléfono ya existe

    // Reserva temporal que aparta el horario mientras completa sus datos
    hold: null, // { id, expira_en }

    // Turno enviado que se está siguiendo
    seguimiento: null, // { id, token, estado, fecha, hora, servicios, total }

    cargando: false,
    error: null,

    // El cliente ocultó el aviso flotante a mano; vuelve a aparecer solo si
    // el estado del turno cambia.
    avisoOculto: false,
  };
}

export const estado = estadoInicial();

/** Vuelve el wizard a cero sin tocar lo que ya está cargado del negocio. */
export function reiniciarFlujo() {
  const { negocioId, config, catalogo } = estado;
  Object.assign(estado, estadoInicial(), { negocioId, config, catalogo });
}

// ---------- Derivados ----------

export function duracionTotal() {
  return estado.servicios.reduce((t, s) => t + (s.duracion || 0), 0);
}

export function precioTotal() {
  return estado.servicios.reduce((t, s) => t + Number(s.precio || 0), 0);
}

export function tieneServicio(id) {
  return estado.servicios.some((s) => s.id === id);
}

/** Un paso está "completo" solo si el cliente realmente eligió algo. */
export function pasoCompleto(n) {
  switch (n) {
    case PASOS.SERVICIOS:
      return estado.servicios.length > 0;
    case PASOS.DIA:
      return Boolean(estado.dia);
    case PASOS.HORA:
      return Boolean(estado.hora);
    case PASOS.DATOS:
      return estado.nombre.trim().length >= 2 && estado.telefono.trim().length >= 6;
    default:
      return false;
  }
}

/** El paso más alto al que se puede saltar sin dejar huecos atrás. */
export function ultimoPasoAlcanzable() {
  for (let n = 1; n < TOTAL_PASOS; n += 1) {
    if (!pasoCompleto(n)) return n;
  }
  return TOTAL_PASOS;
}
