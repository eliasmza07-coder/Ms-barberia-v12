# Módulo de reservas

Flujo de reserva del cliente, autocontenido. Renderiza su propio markup, tiene
su propio estado y su propio CSS. `index.html` solo necesita un contenedor
vacío y algún botón que lo abra.

## Instalar

1. Copiá esta carpeta a `src/modules/reservations/` (reemplaza la anterior).
2. En `index.html`, borrá el modal de reserva viejo y el aviso flotante, y dejá:

```html
<button data-abrir-reserva>Reservar ahora</button>
<div id="reservas"></div>
```

3. En `main.js`:

```js
import { montarReservas } from './modules/reservations/index.js';
montarReservas(document.getElementById('reservas'));
```

4. Corré `SQL_MODULO_RESERVAS.sql` en el SQL Editor de Supabase.

Nada más de la app tiene que importar archivos internos de este módulo. Para
enterarse de lo que pasa, escuchá los eventos:

```js
document.addEventListener('reserva:creada', (e) => { /* e.detail */ });
document.addEventListener('reserva:estado-cambiado', (e) => { /* e.detail */ });
```

## Lo único que puede necesitar ajuste

`reservations.config.js` concentra las dos decisiones que quedaron abiertas:

- **`FUENTE_HORARIOS`** — está en `'auto'`: prueba el esquema nuevo
  (`horarios_semanales` + `excepciones_horario` + `bloqueos`) y, si no hay
  filas, usa el viejo (`config_jornada` + `dias_libres` + `horas_bloqueadas`).
  Cuando confirmes cuál manda, ponelo fijo y ahorrás una consulta por carga.
- **`MODO_CREACION`** — está en `'edge-function'`. Si `gestionar-reserva`
  todavía no acepta un array de servicios ni guarda `token_seguimiento`,
  pasalo a `'directo'` y el módulo inserta en `turnos` + `turno_servicios`
  por su cuenta.

El cliente de Supabase entra por `supabase.js`, que toma el export exista con
el nombre que exista (`supabase`, `supabaseClient`, `client` o default). Si tu
`config/supabaseClient.js` lo llama de otra forma, se agrega ahí y listo — es
el único archivo del módulo que conoce ese nombre.

## El flujo

```
1 Servicios  →  2 Día  →  3 Hora  →  4 Datos  →  5 Resumen  →  seguimiento
```

- **Servicios**: se pueden combinar hasta 3 (`MAX_SERVICIOS_POR_TURNO`). El pie
  va sumando duración y total en vivo.
- **Día**: ventana rodante de `negocio_config.anticipacion_max_dias` días desde
  hoy. Solo aparecen los días que tienen al menos un hueco para esa combinación.
- **Hora**: solo horarios libres, agrupados en Mañana / Tarde / Noche.
- **Datos**: al escribir el teléfono busca en `clientes` y autocompleta el nombre.
- **Resumen**: último vistazo antes de enviar.

Al pasar de Hora a Datos se crea una **reserva temporal** que aparta el horario
por `hold_minutos` con una cuenta regresiva visible. Si el cliente vuelve atrás
o cierra, se libera.

## Decisiones que vale la pena conocer

**Todo se calcula en la zona horaria del negocio** (`negocio_config.zona_horaria`),
nunca con el reloj del navegador.

**Los márgenes de limpieza se aplican una vez al turno completo**, no por
servicio. Sumarlos por cada corte inflaba la duración y hacía desaparecer
horarios que estaban libres.

**Una consulta por tabla para toda la ventana**, no una por día: con 7 días
serían 35 idas y vueltas contra 5.

**El seguimiento va por `token_seguimiento`**, generado en el cliente al enviar.
Ya no hace falta el viejo truco de buscar el turno por fecha + hora + teléfono,
que cuando fallaba dejaba el estado clavado en "pendiente" para siempre.

**Ausencia y error no son lo mismo.** Si no se puede leer el turno (red o RLS),
la tarjeta no se toca. Antes eso mostraba "Turno cancelado" con el turno
perfectamente vivo.

**Ocultar el aviso flotante lo oculta de verdad** hasta que el estado cambie.

**Siempre hay salida.** Con un turno en seguimiento, "Reservar otro turno" está
siempre a mano: antes el modal quedaba tomado por la tarjeta de estado.

## Rendimiento

Solo se animan `transform` y `opacity`. Nada de animar `width`, `height`,
`top`, `left`, `margin` ni sombras — eso fuerza recálculo de layout en cada
frame y en un celular de gama media se nota. Se respeta
`prefers-reduced-motion`, los inputs son de 16px para que iOS no haga zoom al
enfocar, los targets van de 44px para arriba y el pie respeta el safe area.

## Lo que este módulo NO hace

- **Login.** Vive en `modules/auth/`. Si querés vincular el turno a una cuenta,
  pasale `clienteId` a `crearTurno` desde afuera.
- **Avisos con la página cerrada.** Requiere Web Push con service worker (y en
  iOS, que el sitio esté instalado como PWA). Lo práctico es un WhatsApp al
  cliente cuando el barbero confirma.
- **El panel del barbero.** Confirmar y rechazar sigue siendo del módulo admin;
  este módulo se entera por Realtime.
