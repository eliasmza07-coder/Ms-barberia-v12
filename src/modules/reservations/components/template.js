/**
 * modules/reservations/components/template.js
 *
 * El módulo pinta su propio markup. Antes el controller dependía de más de
 * veinte IDs que vivían en index.html, así que no se podía mover ni
 * reemplazar sin editar el HTML global. Ahora index.html solo necesita un
 * contenedor vacío y un botón con [data-abrir-reserva].
 */

export function plantillaHoja() {
  return `
<div class="rsv" data-rsv-raiz hidden>
  <div class="rsv__velo" data-rsv-cerrar></div>

  <section class="rsv__hoja" role="dialog" aria-modal="true" aria-labelledby="rsvTitulo">
    <header class="rsv__cabecera">
      <button type="button" class="rsv__volver" data-rsv-atras aria-label="Volver">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="rsv__titulos">
        <p class="rsv__eyebrow" data-rsv-eyebrow>Paso 1 de 4</p>
        <h2 class="rsv__titulo" id="rsvTitulo" data-rsv-titulo>Elegí tu servicio</h2>
      </div>
      <button type="button" class="rsv__cerrar" data-rsv-cerrar aria-label="Cerrar">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </header>

    <div class="rsv__barra" aria-hidden="true"><span class="rsv__barra-avance" data-rsv-avance></span></div>

    <div class="rsv__cuerpo" data-rsv-cuerpo>
      <div class="rsv__panel" data-rsv-panel></div>
    </div>

    <footer class="rsv__pie">
      <div class="rsv__totales" data-rsv-totales hidden></div>
      <p class="rsv__error" data-rsv-error role="alert" hidden></p>
      <button type="button" class="rsv__cta" data-rsv-siguiente disabled>Continuar</button>
    </footer>
  </section>
</div>

<aside class="rsv-aviso" data-rsv-aviso hidden>
  <button type="button" class="rsv-aviso__cuerpo" data-rsv-abrir-seguimiento>
    <span class="rsv-aviso__punto" data-rsv-aviso-punto></span>
    <span class="rsv-aviso__texto">
      <strong data-rsv-aviso-titulo>Solicitud enviada</strong>
      <small data-rsv-aviso-detalle></small>
    </span>
  </button>
  <button type="button" class="rsv-aviso__cerrar" data-rsv-aviso-cerrar aria-label="Ocultar aviso">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
  </button>
</aside>`;
}

export const TITULOS = {
  1: { eyebrow: 'Paso 1 de 4', titulo: 'Elegí tu servicio', cta: 'Continuar' },
  2: { eyebrow: 'Paso 2 de 4', titulo: '¿Qué día te viene bien?', cta: 'Continuar' },
  3: { eyebrow: 'Paso 3 de 4', titulo: 'Elegí tu horario', cta: 'Continuar' },
  4: { eyebrow: 'Paso 4 de 4', titulo: 'Tus datos', cta: 'Revisar solicitud' },
  5: { eyebrow: 'Último vistazo', titulo: 'Confirmá tu turno', cta: 'Enviar solicitud' },
};
