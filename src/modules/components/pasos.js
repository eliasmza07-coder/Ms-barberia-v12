/**
 * modules/reservations/components/pasos.js
 *
 * Solo dibuja. No decide reglas ni llama a Supabase: recibe el estado ya
 * calculado y devuelve HTML. Las clases usan variables CSS del tema, no
 * utilidades de color fijas — así el editor de apariencia del panel sigue
 * funcionando sobre este módulo.
 */
import { fechaLegible, nombreDiaCorto, numeroDia, nombreMesCorto } from '../utils/fechas.js';

const gs = (n) => new Intl.NumberFormat('es-PY').format(Number(n) || 0);

function minutosLegibles(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// ---------- Paso 1: servicios ----------

export function pasoServicios(estado, { maximo }) {
  if (!estado.catalogo.length) {
    return vacio('No hay servicios cargados', 'Escribinos por WhatsApp y coordinamos tu turno.');
  }

  const tarjetas = estado.catalogo
    .map((s, i) => {
      const elegido = estado.servicios.some((e) => e.id === s.id);
      const tope = !elegido && estado.servicios.length >= maximo;
      return `
      <button type="button"
        class="rsv-card rsv-card--servicio${elegido ? ' is-elegido' : ''}"
        data-rsv-servicio="${s.id}"
        ${tope ? 'disabled' : ''}
        aria-pressed="${elegido}"
        style="--i:${i}">
        <span class="rsv-card__marca" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
        </span>
        <span class="rsv-card__cuerpo">
          <span class="rsv-card__nombre">${s.nombre}</span>
          ${s.desc ? `<span class="rsv-card__desc">${s.desc}</span>` : ''}
        </span>
        <span class="rsv-card__meta">
          <span class="rsv-card__precio">${gs(s.precio)} Gs</span>
          <span class="rsv-card__duracion">${minutosLegibles(s.duracion)}</span>
        </span>
      </button>`;
    })
    .join('');

  return `
    <p class="rsv__ayuda">Podés combinar hasta ${maximo} servicios en un mismo turno.</p>
    <div class="rsv-lista">${tarjetas}</div>`;
}

// ---------- Paso 2: días ----------

export function pasoDias(estado) {
  if (!estado.dias.length) {
    return vacio(
      'No hay días disponibles',
      'Con los servicios que elegiste no queda ningún hueco en los próximos días. Probá con menos servicios o escribinos por WhatsApp.'
    );
  }

  const tarjetas = estado.dias
    .map((d, i) => {
      const elegido = estado.dia === d.fecha;
      return `
      <button type="button"
        class="rsv-dia${elegido ? ' is-elegido' : ''}"
        data-rsv-dia="${d.fecha}"
        aria-pressed="${elegido}"
        style="--i:${i}">
        <span class="rsv-dia__semana">${nombreDiaCorto(d.fecha)}</span>
        <span class="rsv-dia__numero">${numeroDia(d.fecha)}</span>
        <span class="rsv-dia__mes">${nombreMesCorto(d.fecha)}</span>
        <span class="rsv-dia__libres">${d.cantidad} libre${d.cantidad === 1 ? '' : 's'}</span>
      </button>`;
    })
    .join('');

  return `
    <p class="rsv__ayuda">Mostramos solo los días con lugar para tu combinación.</p>
    <div class="rsv-dias" role="group" aria-label="Días disponibles">${tarjetas}</div>`;
}

// ---------- Paso 3: horarios ----------

export function pasoHoras(estado) {
  if (!estado.horas.length) {
    return vacio('Ese día se llenó', 'Volvé y elegí otro día — te muestro los que todavía tienen lugar.');
  }

  const franjas = ['Mañana', 'Tarde', 'Noche'];
  const bloques = franjas
    .map((f) => {
      const horas = estado.horas.filter((h) => h.franja === f);
      if (!horas.length) return '';
      const botones = horas
        .map(
          (h, i) => `
        <button type="button"
          class="rsv-hora${estado.hora === h.hora ? ' is-elegido' : ''}"
          data-rsv-hora="${h.hora}"
          aria-pressed="${estado.hora === h.hora}"
          style="--i:${i}">${h.hora}</button>`
        )
        .join('');
      return `<div class="rsv-franja"><h3 class="rsv-franja__titulo">${f}</h3><div class="rsv-horas">${botones}</div></div>`;
    })
    .join('');

  return `<p class="rsv__ayuda">${fechaLegible(estado.dia)}</p>${bloques}`;
}

// ---------- Paso 4: datos ----------

export function pasoDatos(estado) {
  return `
    <div class="rsv-campo">
      <label for="rsvTelefono">Tu teléfono</label>
      <input id="rsvTelefono" type="tel" inputmode="tel" autocomplete="tel"
             placeholder="0981 123 456" value="${estado.telefono}" data-rsv-input="telefono">
      <p class="rsv-campo__ayuda" data-rsv-hint-telefono>Lo usamos para avisarte cuando confirmemos.</p>
    </div>

    <div class="rsv-campo">
      <label for="rsvNombre">Tu nombre</label>
      <input id="rsvNombre" type="text" autocomplete="name"
             placeholder="Nombre y apellido" value="${estado.nombre}" data-rsv-input="nombre">
    </div>

    <div class="rsv-campo">
      <label for="rsvComentario">Algo que quieras aclarar <span>(opcional)</span></label>
      <textarea id="rsvComentario" rows="2" placeholder="Ej: vengo con mi hijo"
                data-rsv-input="comentario">${estado.comentario}</textarea>
    </div>

    <p class="rsv-hold" data-rsv-hold hidden></p>`;
}

// ---------- Paso 5: resumen ----------

export function pasoResumen(estado, { duracion, total }) {
  const filas = estado.servicios
    .map(
      (s) => `<li><span>${s.nombre}</span><span>${gs(s.precio)} Gs</span></li>`
    )
    .join('');

  return `
    <div class="rsv-resumen">
      <div class="rsv-resumen__cuando">
        <strong>${fechaLegible(estado.dia)}</strong>
        <span>${estado.hora} · ${minutosLegibles(duracion)}</span>
      </div>
      <ul class="rsv-resumen__items">${filas}</ul>
      <div class="rsv-resumen__total"><span>Total</span><strong>${gs(total)} Gs</strong></div>
      <div class="rsv-resumen__cliente">
        <span>${estado.nombre}</span>
        <span>${estado.telefono}</span>
        ${estado.comentario ? `<span class="rsv-resumen__nota">${estado.comentario}</span>` : ''}
      </div>
    </div>
    <p class="rsv__ayuda rsv__ayuda--centro">Tu turno queda pendiente hasta que el barbero lo confirme. Te avisamos acá mismo.</p>`;
}

// ---------- Totales del pie ----------

export function totales({ cantidad, duracion, total }) {
  if (!cantidad) return '';
  return `
    <span class="rsv-totales__izq">${cantidad} servicio${cantidad === 1 ? '' : 's'} · ${minutosLegibles(duracion)}</span>
    <span class="rsv-totales__der">${gs(total)} Gs</span>`;
}

// ---------- Estados vacíos ----------

export function vacio(titulo, detalle) {
  return `
    <div class="rsv-vacio">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
      <h3>${titulo}</h3>
      <p>${detalle}</p>
    </div>`;
}

export function cargando(texto = 'Buscando horarios') {
  return `
    <div class="rsv-cargando" aria-live="polite">
      <span class="rsv-cargando__barra"></span>
      <span class="rsv-cargando__barra"></span>
      <span class="rsv-cargando__barra"></span>
      <p>${texto}</p>
    </div>`;
}
