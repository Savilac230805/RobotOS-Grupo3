-- ============================================================
-- RobotOS SmartHouse - Migración 002: telemetría y roles
-- Ejecutar en Supabase > SQL Editor (se puede ejecutar más de una vez).
--
-- Modelo de acceso:
--   * Lectura pública (sin cuenta): kernel_events y boot_history.
--   * Inserción de telemetría de simulación (origin = 'sandbox'): cualquiera.
--   * Modificar o borrar datos, o insertar origin = 'admin': solo ADMIN real
--     (usuario autenticado con fila ADMIN en public.user_roles).
--   * user_roles: ningún usuario puede escribirla desde la API.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Roles
-- ------------------------------------------------------------
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('ADMIN', 'USER')),
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select_own"
  on public.user_roles
  for select
  to authenticated
  using (user_id = (select auth.uid()));
-- Sin políticas de insert/update/delete: nadie puede escribir roles desde la API.
-- El primer ADMIN se crea manualmente desde el SQL Editor (ver el final de este archivo).

-- Función auxiliar: ¿el usuario autenticado tiene rol ADMIN?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'ADMIN'
  );
$$;

-- ------------------------------------------------------------
-- 2. Eventos del kernel (esquema JSON del Event Engine)
-- ------------------------------------------------------------
create table if not exists public.kernel_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  occurred_at timestamptz not null default now(),
  source text not null default 'KERNEL',
  type text not null,
  severity text not null default 'INFO',
  pid integer,
  payload jsonb not null default '{}'::jsonb,
  session_id text,
  origin text not null default 'sandbox' check (origin in ('sandbox', 'admin')),
  created_at timestamptz not null default now(),
  constraint kernel_events_text_len
    check (char_length(type) <= 64 and char_length(source) <= 64 and char_length(severity) <= 16),
  constraint kernel_events_payload_size
    check (pg_column_size(payload) <= 8192)
);

create index if not exists kernel_events_occurred_at_idx on public.kernel_events (occurred_at desc);
create index if not exists kernel_events_type_idx on public.kernel_events (type);
create index if not exists kernel_events_session_idx on public.kernel_events (session_id);

alter table public.kernel_events enable row level security;

drop policy if exists "kernel_events_public_read" on public.kernel_events;
create policy "kernel_events_public_read"
  on public.kernel_events
  for select
  to anon, authenticated
  using (true);

drop policy if exists "kernel_events_insert" on public.kernel_events;
create policy "kernel_events_insert"
  on public.kernel_events
  for insert
  to anon, authenticated
  with check (origin = 'sandbox' or (select public.is_admin()));

drop policy if exists "kernel_events_admin_update" on public.kernel_events;
create policy "kernel_events_admin_update"
  on public.kernel_events
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "kernel_events_admin_delete" on public.kernel_events;
create policy "kernel_events_admin_delete"
  on public.kernel_events
  for delete
  to authenticated
  using ((select public.is_admin()));

-- ------------------------------------------------------------
-- 3. Historial de arranque
-- ------------------------------------------------------------
create table if not exists public.boot_history (
  id uuid primary key default gen_random_uuid(),
  booted_at timestamptz not null default now(),
  success boolean not null,
  safe_mode boolean not null default false,
  stages jsonb not null default '[]'::jsonb,
  session_id text,
  origin text not null default 'sandbox' check (origin in ('sandbox', 'admin')),
  constraint boot_history_stages_size check (pg_column_size(stages) <= 16384)
);

create index if not exists boot_history_booted_at_idx on public.boot_history (booted_at desc);

alter table public.boot_history enable row level security;

drop policy if exists "boot_history_public_read" on public.boot_history;
create policy "boot_history_public_read"
  on public.boot_history
  for select
  to anon, authenticated
  using (true);

drop policy if exists "boot_history_insert" on public.boot_history;
create policy "boot_history_insert"
  on public.boot_history
  for insert
  to anon, authenticated
  with check (origin = 'sandbox' or (select public.is_admin()));

drop policy if exists "boot_history_admin_update" on public.boot_history;
create policy "boot_history_admin_update"
  on public.boot_history
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "boot_history_admin_delete" on public.boot_history;
create policy "boot_history_admin_delete"
  on public.boot_history
  for delete
  to authenticated
  using ((select public.is_admin()));

-- ------------------------------------------------------------
-- 4. Permisos de tabla (RLS decide qué filas; GRANT decide si se puede intentar)
-- ------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on public.user_roles to authenticated;

grant select, insert on public.kernel_events to anon, authenticated;
grant update, delete on public.kernel_events to authenticated;

grant select, insert on public.boot_history to anon, authenticated;
grant update, delete on public.boot_history to authenticated;

-- ============================================================
-- PRIMER ADMIN (ejecutar aparte, solo cuando ya hayas creado el usuario
-- en Authentication > Users). Reemplaza el correo por el real.
-- ============================================================
-- insert into public.user_roles (user_id, role)
-- select id, 'ADMIN' from auth.users where email = 'TU_CORREO_ADMIN@ejemplo.com'
-- on conflict (user_id) do update set role = 'ADMIN';
--
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"ADMIN"}'::jsonb
-- where email = 'TU_CORREO_ADMIN@ejemplo.com';

-- ============================================================
-- PRUEBAS DE SEGURIDAD (ejecutar aparte, una por una)
-- ============================================================
-- 1) Un visitante (anon) puede insertar telemetría sandbox:
--    begin;
--    set local role anon;
--    insert into public.kernel_events (event_id, type) values ('prueba-anon-1', 'TEST_ANON');
--    rollback;
--
-- 2) Un visitante NO puede borrar (debe afectar 0 filas):
--    begin;
--    set local role anon;
--    delete from public.kernel_events;
--    rollback;
--
-- 3) Un visitante NO puede insertar como admin (debe dar error de política RLS):
--    begin;
--    set local role anon;
--    insert into public.kernel_events (event_id, type, origin) values ('prueba-anon-2', 'TEST_ANON', 'admin');
--    rollback;
