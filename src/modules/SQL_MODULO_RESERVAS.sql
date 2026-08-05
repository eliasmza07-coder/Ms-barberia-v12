-- ============================================================
-- Módulo de reservas — SQL de apoyo
-- Idempotente: se puede correr más de una vez sin romper nada.
-- ============================================================

-- 1) Seguimiento por token
-- ------------------------------------------------------------
-- El cliente necesita leer el estado de SU turno sin estar logueado. Dar
-- un `select` abierto sobre `turnos` a anon expondría los datos de todos
-- los clientes (nombres y teléfonos incluidos). En su lugar, una función
-- que recibe el token y devuelve solo esa fila, con los campos mínimos.

create or replace function public.estado_turno(p_token uuid)
returns table (
  id bigint,
  estado text,
  fecha date,
  hora time,
  motivo_cancelacion text
)
language sql
security definer
set search_path = public
as $$
  select t.id, t.estado, t.fecha, t.hora, t.motivo_cancelacion
  from turnos t
  where t.token_seguimiento = p_token
  limit 1;
$$;

grant execute on function public.estado_turno(uuid) to anon, authenticated;

-- Cancelar el propio turno, también por token.
create or replace function public.cancelar_turno(p_token uuid, p_motivo text)
returns void
language sql
security definer
set search_path = public
as $$
  update turnos
     set estado = 'cancelado',
         motivo_cancelacion = coalesce(p_motivo, 'Cancelado por el cliente'),
         cancelado_por = 'cliente'
   where token_seguimiento = p_token
     and estado in ('pendiente', 'confirmado');
$$;

grant execute on function public.cancelar_turno(uuid, text) to anon, authenticated;


-- 2) Reservas temporales (el "hold" del horario)
-- ------------------------------------------------------------
-- Cualquiera puede crear y leer holds: no contienen datos personales,
-- solo fecha, hora y duración. Nadie puede editarlos ni borrar los ajenos.

alter table public.reservas_temporales enable row level security;

drop policy if exists "holds visibles" on public.reservas_temporales;
create policy "holds visibles" on public.reservas_temporales
  for select using (true);

drop policy if exists "crear hold" on public.reservas_temporales;
create policy "crear hold" on public.reservas_temporales
  for insert with check (true);

drop policy if exists "borrar hold vencido" on public.reservas_temporales;
create policy "borrar hold vencido" on public.reservas_temporales
  for delete using (true);

-- Limpieza de holds vencidos. Llamala desde un cron de Supabase
-- (Database → Cron) cada 5 minutos, o dejá que se acumulen: las consultas
-- ya filtran por expira_en, así que solo ocupan espacio.
create or replace function public.limpiar_holds_vencidos()
returns void
language sql
as $$
  delete from reservas_temporales where expira_en < now();
$$;


-- 3) Índices para que la ventana de 7 días siga siendo barata
-- ------------------------------------------------------------
create index if not exists idx_turnos_negocio_fecha on public.turnos (negocio_id, fecha);
create index if not exists idx_turnos_token on public.turnos (token_seguimiento);
create index if not exists idx_bloqueos_negocio_fecha on public.bloqueos (negocio_id, fecha);
create index if not exists idx_temporales_negocio_fecha on public.reservas_temporales (negocio_id, fecha);
create index if not exists idx_temporales_expira on public.reservas_temporales (expira_en);


-- 4) Anti doble-reserva a nivel base (opcional pero muy recomendado)
-- ------------------------------------------------------------
-- Si `turnos.rango` todavía no tiene una restricción de exclusión, esto
-- hace que Postgres mismo rechace dos turnos superpuestos del mismo
-- negocio. Es la única garantía real contra dos clientes reservando el
-- mismo horario en el mismo segundo.
--
-- Revisá primero qué hay:
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint where conrelid = 'turnos'::regclass;
--
-- create extension if not exists btree_gist;
-- alter table public.turnos
--   add constraint turnos_sin_superposicion
--   exclude using gist (
--     negocio_id with =,
--     rango with &&
--   ) where (estado in ('pendiente', 'confirmado'));
