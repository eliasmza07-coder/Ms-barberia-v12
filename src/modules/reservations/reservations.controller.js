/**
 * modules/reservations/reservations.controller.js
 *
 * Orquesta el flujo. Toda la interacción se resuelve con delegación de
 * eventos sobre la raíz del módulo, así que repintar un paso no obliga a
 * volver a enganchar listeners (y no deja listeners colgados).
 *
 * Hacia afuera el módulo solo emite eventos en `document`:
 *   reserva:creada          → { token, id, fecha, hora, total }
 *   reserva:estado-cambiado → { token, estado }
 * Nadie de afuera llama funciones internas de acá.
 */
import { plantillaHoja, TITULOS } from './components/template.js';
import { pasoServicios, pasoDias, pasoHoras, pasoDatos, pasoResumen, totales, cargando } from './components/pasos.js';
import { tarjetaSeguimiento, estiloDe } from './components/seguimiento.js';
import { estado, PASOS, TOTAL_PASOS, reiniciarFlujo, duracionTotal, precioTotal, tieneServicio, pasoCompleto } from './reservations.state.js';
import { ReservationsService } from './reservations.service.js';
import { MAX_SERVICIOS_POR_TURNO, CLAVE_SEGUIMIENTO } from './reservations.config.js';
import { fechaLegible } from './utils/fechas.js';

let raiz;
let desuscribir = null;
let temporizadorHold = null;
let calculo = { duracion: 0, margenAntes: 0, margenDespues: 0, horasPorDia: {} };

// ---------- Helpers de DOM ----------
const el = (sel) => raiz.querySelector(sel);
const cuerpo = () => el('[data-rsv-panel]');

function emitir(nombre, detalle) {
  document.dispatchEvent(new CustomEvent(nombre, { detail: detalle }));
}

// ---------- Persistencia del seguimiento ----------
function guardarSeguimiento() {
  try {
    if (estado.seguimiento) localStorage.setItem(CLAVE_SEGUIMIENTO, JSON.stringify(estado.seguimiento));
    else localStorage.removeItem(CLAVE_SEGUIMIENTO);
  } catch {
    /* modo privado: el seguimiento vive solo en memoria */
  }
}

function leerSeguimiento() {
  try {
    const crudo = localStorage.getItem(CLAVE_SEGUIMIENTO);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null;
  }
}

// ---------- Pintado ----------

function pintarCabecera() {
  const t = TITULOS[estado.paso];
  el('[data-rsv-eyebrow]').textContent = t.eyebrow;
  el('[data-rsv-titulo]').textContent = t.titulo;
  el('[data-rsv-siguiente]').textContent = t.cta;
  el('[data-rsv-atras]').hidden = estado.paso === PASOS.SERVICIOS;
  el('[data-rsv-avance]').style.transform = `scaleX(${estado.paso / TOTAL_PASOS})`;
}

function pintarTotales() {
  const caja = el('[data-rsv-totales]');
  const cantidad = estado.servicios.length;
  const mostrar = cantidad > 0 && !estado.seguimiento;
  caja.hidden = !mostrar;
  if (mostrar) caja.innerHTML = totales({ cantidad, duracion: duracionTotal(), total: precioTotal() });
}

function pintarCTA() {
  const btn = el('[data-rsv-siguiente]');
  btn.hidden = Boolean(estado.seguimiento);
  btn.disabled = estado.paso === PASOS.RESUMEN ? false : !pasoCompleto(estado.paso);
}

function mostrarError(mensaje) {
  const p = el('[data-rsv-error]');
  p.hidden = !mensaje;
  p.textContent = mensaje || '';
}

/** Cambia el contenido del panel con una transición corta (transform + opacity). */
function pintarPanel(html, direccion = 'adelante') {
  const panel = cuerpo();
  panel.dataset.direccion = direccion;
  panel.classList.remove('is-entrando');
  // Forzar reflow para que la animación se reinicie aunque el paso repita clase.
  void panel.offsetWidth;
  panel.innerHTML = html;
  panel.classList.add('is-entrando');
  panel.scrollTop = 0;
}

function render(direccion = 'adelante') {
  if (estado.seguimiento) {
    pintarCabecera();
    el('[data-rsv-eyebrow]').textContent = 'Tu solicitud';
    el('[data-rsv-titulo]').textContent = 'Estado del turno';
    el('[data-rsv-atras]').hidden = true;
    el('[data-rsv-avance]').style.transform = 'scaleX(1)';
    pintarPanel(tarjetaSeguimiento(estado.seguimiento), direccion);
    pintarTotales();
    pintarCTA();
    mostrarError(null);
    return;
  }

  pintarCabecera();
  mostrarError(null);

  let html = '';
  if (estado.cargando) html = cargando();
  else if (estado.paso === PASOS.SERVICIOS) html = pasoServicios(estado, { maximo: MAX_SERVICIOS_POR_TURNO });
  else if (estado.paso === PASOS.DIA) html = pasoDias(estado);
  else if (estado.paso === PASOS.HORA) html = pasoHoras(estado);
  else if (estado.paso === PASOS.DATOS) html = pasoDatos(estado);
  else if (estado.paso === PASOS.RESUMEN) html = pasoResumen(estado, { duracion: duracionTotal(), total: precioTotal() });

  pintarPanel(html, direccion);
  pintarTotales();
  pintarCTA();
  if (estado.paso === PASOS.DATOS) pintarHold();
}

// ---------- Aviso flotante ----------

function pintarAviso() {
  const aviso = el('[data-rsv-aviso]');
  const abierto = !el('[data-rsv-raiz]').hidden;
  const mostrar = Boolean(estado.seguimiento) && !abierto && !estado.avisoOculto;
  aviso.hidden = !mostrar;
  if (!mostrar) return;

  const e = estiloDe(estado.seguimiento.estado);
  aviso.dataset.estado = estado.seguimiento.estado;
  el('[data-rsv-aviso-titulo]').textContent = e.corta;
  el('[data-rsv-aviso-detalle]').textContent = `${fechaLegible(estado.seguimiento.fecha)} · ${estado.seguimiento.hora}`;
}

// ---------- Hold ----------

function pintarHold() {
  const caja = el('[data-rsv-hold]');
  if (!caja) return;
  clearInterval(temporizadorHold);
  if (!estado.hold) {
    caja.hidden = true;
    return;
  }
  caja.hidden = false;

  const tic = () => {
    const restan = Math.max(0, Math.round((new Date(estado.hold.expira_en) - Date.now()) / 1000));
    if (restan <= 0) {
      clearInterval(temporizadorHold);
      caja.textContent = 'Se venció la reserva del horario. Volvé a elegirlo.';
      caja.dataset.vencido = 'true';
      estado.hold = null;
      return;
    }
    const m = Math.floor(restan / 60);
    const s = String(restan % 60).padStart(2, '0');
    caja.textContent = `Te guardamos las ${estado.hora} por ${m}:${s}`;
  };
  tic();
  temporizadorHold = setInterval(tic, 1000);
}

async function apartarHorario() {
  await soltarHorario();
  estado.hold = await ReservationsService.apartarHorario({
    negocioId: estado.negocioId,
    fecha: estado.dia,
    hora: estado.hora,
    duracion: calculo.duracion,
    margenAntes: calculo.margenAntes,
    margenDespues: calculo.margenDespues,
    config: estado.config,
  });
}

async function soltarHorario() {
  clearInterval(temporizadorHold);
  if (estado.hold?.id) await ReservationsService.liberarHorario(estado.hold.id);
  estado.hold = null;
}

// ---------- Disponibilidad ----------

async function recalcularVentana() {
  estado.cargando = true;
  render();
  try {
    const r = await ReservationsService.calcularVentana({
      negocioId: estado.negocioId,
      config: estado.config,
      servicios: estado.servicios,
    });
    calculo = { duracion: r.duracion, margenAntes: r.margenAntes, margenDespues: r.margenDespues, horasPorDia: r.horasPorDia };
    estado.dias = r.dias;

    // Si el día u hora que ya tenía elegidos dejaron de existir, se limpian
    // en silencio en vez de mandar una reserva a un horario que ya no está.
    if (estado.dia && !r.horasPorDia[estado.dia]) {
      estado.dia = null;
      estado.hora = null;
    }
    if (estado.dia) {
      estado.horas = r.horasPorDia[estado.dia];
      if (estado.hora && !estado.horas.some((h) => h.hora === estado.hora)) estado.hora = null;
    }
  } catch (err) {
    console.error('[reservas] no se pudo calcular la disponibilidad', err);
    estado.dias = [];
    estado.error = 'No pudimos cargar los horarios. Revisá tu conexión y probá de nuevo.';
  } finally {
    estado.cargando = false;
    render();
    if (estado.error) mostrarError(estado.error);
  }
}

// ---------- Navegación ----------

async function irAPaso(n, direccion = 'adelante') {
  estado.paso = Math.min(Math.max(n, 1), TOTAL_PASOS);
  if (estado.paso === PASOS.DIA) await recalcularVentana();
  else render(direccion);
}

async function avanzar() {
  if (estado.paso === PASOS.RESUMEN) return enviar();
  if (!pasoCompleto(estado.paso)) return;

  if (estado.paso === PASOS.HORA) {
    await apartarHorario();
  }
  await irAPaso(estado.paso + 1, 'adelante');
}

async function retroceder() {
  if (estado.paso === PASOS.DATOS) await soltarHorario();
  await irAPaso(estado.paso - 1, 'atras');
}

// ---------- Envío ----------

async function enviar() {
  const btn = el('[data-rsv-siguiente]');
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  mostrarError(null);

  try {
    const resultado = await ReservationsService.crearTurno({
      negocioId: estado.negocioId,
      fecha: estado.dia,
      hora: estado.hora,
      servicios: estado.servicios,
      nombre: estado.nombre,
      telefono: estado.telefono,
      comentario: estado.comentario,
      config: estado.config,
      duracion: calculo.duracion,
      margenAntes: calculo.margenAntes,
      margenDespues: calculo.margenDespues,
      clienteRefId: estado.clienteConocido?.id || null,
    });

    await soltarHorario();

    estado.seguimiento = {
      token: resultado.token,
      id: resultado.id,
      estado: resultado.estado,
      fecha: estado.dia,
      hora: estado.hora,
      servicios: estado.servicios.map((s) => ({ nombre: s.nombre, precio: s.precio })),
      total: precioTotal(),
    };
    guardarSeguimiento();
    escucharTurno();
    render('adelante');
    pintarAviso();
    emitir('reserva:creada', { ...estado.seguimiento });
  } catch (err) {
    mostrarError(err.message || 'No se pudo enviar la solicitud. Probá de nuevo.');
    btn.disabled = false;
    btn.textContent = TITULOS[PASOS.RESUMEN].cta;
  }
}

// ---------- Seguimiento en vivo ----------

function escucharTurno() {
  if (desuscribir) desuscribir();
  if (!estado.seguimiento?.token) return;
  desuscribir = ReservationsService.suscribirATurno(estado.seguimiento.token, () => revisarEstado());
}

async function revisarEstado() {
  if (!estado.seguimiento?.token) return;
  const { ok, turno } = await ReservationsService.estadoDelTurno(estado.seguimiento.token);

  // No se pudo leer: puede ser la red o una política. No se toca el estado
  // mostrado — decir "cancelado" acá sería mentirle al cliente.
  if (!ok) return;

  const nuevo = turno ? turno.estado : 'cancelado';
  if (turno?.motivo_cancelacion) estado.seguimiento.motivo_cancelacion = turno.motivo_cancelacion;
  if (nuevo === estado.seguimiento.estado) return;

  estado.seguimiento.estado = nuevo;
  guardarSeguimiento();
  if (!el('[data-rsv-raiz]').hidden) render();
  estado.avisoOculto = false;
  pintarAviso();
  emitir('reserva:estado-cambiado', { token: estado.seguimiento.token, estado: nuevo });
}

async function restaurarSeguimiento() {
  const guardado = leerSeguimiento();
  if (!guardado?.token) return;
  estado.seguimiento = guardado;
  escucharTurno();
  await revisarEstado();
  pintarAviso();
}

// ---------- Abrir / cerrar ----------

function abrir() {
  el('[data-rsv-raiz]').hidden = false;
  document.body.classList.add('rsv-abierto');
  render('adelante');
  pintarAviso();
}

async function cerrar() {
  await soltarHorario();
  el('[data-rsv-raiz]').hidden = true;
  document.body.classList.remove('rsv-abierto');
  pintarAviso();
}

function nuevaReserva() {
  if (desuscribir) desuscribir();
  desuscribir = null;
  estado.seguimiento = null;
  estado.avisoOculto = false;
  guardarSeguimiento();
  reiniciarFlujo();
  render('adelante');
  pintarAviso();
}

// ---------- Interacción (delegada) ----------

function engancharEventos() {
  raiz.addEventListener('click', async (e) => {
    const t = e.target;

    if (t.closest('[data-rsv-cerrar]')) return cerrar();
    if (t.closest('[data-rsv-atras]')) return retroceder();
    if (t.closest('[data-rsv-siguiente]')) return avanzar();
    if (t.closest('[data-rsv-abrir-seguimiento]')) return abrir();
    if (t.closest('[data-rsv-nueva]')) return nuevaReserva();

    if (t.closest('[data-rsv-aviso-cerrar]')) {
      // Ocultar el aviso lo oculta de verdad hasta que cambie el estado.
      // Antes volvía a aparecer solo en el próximo repintado.
      estado.avisoOculto = true;
      pintarAviso();
      return;
    }

    const btnServicio = t.closest('[data-rsv-servicio]');
    if (btnServicio) {
      const id = btnServicio.dataset.rsvServicio;
      if (tieneServicio(id)) estado.servicios = estado.servicios.filter((s) => s.id !== id);
      else if (estado.servicios.length < MAX_SERVICIOS_POR_TURNO) {
        const s = estado.catalogo.find((c) => String(c.id) === String(id));
        if (s) estado.servicios.push(s);
      }
      // Cambió la duración total: lo que había elegido después ya no vale.
      estado.dia = null;
      estado.hora = null;
      render();
      return;
    }

    const btnDia = t.closest('[data-rsv-dia]');
    if (btnDia) {
      estado.dia = btnDia.dataset.rsvDia;
      estado.hora = null;
      estado.horas = calculo.horasPorDia[estado.dia] || [];
      render();
      return;
    }

    const btnHora = t.closest('[data-rsv-hora]');
    if (btnHora) {
      estado.hora = btnHora.dataset.rsvHora;
      render();
      return;
    }

    if (t.closest('[data-rsv-cancelar]')) {
      const btn = t.closest('[data-rsv-cancelar]');
      btn.disabled = true;
      btn.textContent = 'Cancelando…';
      await ReservationsService.cancelarTurno(estado.seguimiento.token, 'Cancelado por el cliente');
      await revisarEstado();
    }
  });

  raiz.addEventListener('input', async (e) => {
    const campo = e.target.dataset?.rsvInput;
    if (!campo) return;
    estado[campo] = e.target.value;
    pintarCTA();

    if (campo === 'telefono' && e.target.value.trim().length >= 6) {
      const cliente = await ReservationsService.buscarCliente(estado.negocioId, e.target.value.trim());
      estado.clienteConocido = cliente;
      const hint = el('[data-rsv-hint-telefono]');
      if (cliente && !estado.nombre) {
        estado.nombre = cliente.nombre || '';
        const inpNombre = raiz.querySelector('[data-rsv-input="nombre"]');
        if (inpNombre) inpNombre.value = estado.nombre;
        if (hint) hint.textContent = `¡Hola de nuevo, ${cliente.nombre?.split(' ')[0] || ''}!`;
        pintarCTA();
      }
    }
  });

  // Cerrar con Escape, como cualquier hoja modal.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el('[data-rsv-raiz]').hidden) cerrar();
  });

  // Al volver a la pestaña, revisar si el estado cambió mientras no estaba.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') revisarEstado();
  });
}

// ---------- API ----------

export const ReservationsController = {
  /**
   * @param {HTMLElement} contenedor - nodo vacío donde vive el módulo.
   * @param {Object} opciones - { slug } del negocio (opcional mientras sea uno solo).
   */
  async montar(contenedor, opciones = {}) {
    contenedor.innerHTML = plantillaHoja();
    raiz = contenedor;

    engancharEventos();

    document.querySelectorAll('[data-abrir-reserva]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        abrir();
      });
    });

    try {
      const ctx = await ReservationsService.cargarContexto(opciones.slug);
      estado.negocioId = ctx.negocioId;
      estado.config = ctx.config;
      estado.catalogo = ctx.catalogo;
    } catch (err) {
      console.error('[reservas] no se pudo cargar el contexto del negocio', err);
    }

    await restaurarSeguimiento();
  },

  desmontar() {
    if (desuscribir) desuscribir();
    clearInterval(temporizadorHold);
    raiz.innerHTML = '';
  },

  abrir,
  cerrar,
};
