-- ============================================================
-- RobotOS SmartHouse - Migración 003: processes y system_config
-- Ejecutar en Supabase > SQL Editor DESPUÉS de la 002 (se puede repetir).
-- No modifica la 002.
--
-- Mismo modelo de acceso que la 002:
--   * Lectura pública.
--   * processes: cualquiera inserta (origin = 'sandbox'); solo ADMIN
--     inserta como 'admin', modifica o borra.
--   * system_config: lectura pública; escribir solo ADMIN.
-- ============================================================

-- ------------------------------------------------------------
-- 1. processes: historial de estados de procesos (una fila por cambio)
-- ------------------------------------------------------------
create table if not exists public.processes (
  id uuid primary key default gen_random_uuid(),
  pid integer not null,
  name text not null,
  state text not null,
  priority integer,
  memory_blocks integer not null default 0,
  device text,
  recorded_at timestamptz not null default now(),
  session_id text,
  origin text not null default 'sandbox' check (origin in ('sandbox', 'admin')),
  created_at timestamptz not null default now(),
  constraint processes_text_len
    check (char_length(name) <= 64 and char_length(state) <= 32)
);

create index if not exists processes_recorded_at_idx on public.processes (recorded_at desc);
create index if not exists processes_pid_idx on public.processes (pid);
create index if not exists processes_session_idx on public.processes (session_id);

alter table public.processes enable row level security;

drop policy if exists "processes_public_read" on public.processes;
create policy "processes_public_read"
  on public.processes
  for select
  to anon, authenticated
  using (true);

drop policy if exists "processes_insert" on public.processes;
create policy "processes_insert"
  on public.processes
  for insert
  to anon, authenticated
  with check (origin = 'sandbox' or (select public.is_admin()));

drop policy if exists "processes_admin_update" on public.processes;
create policy "processes_admin_update"
  on public.processes
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "processes_admin_delete" on public.processes;
create policy "processes_admin_delete"
  on public.processes
  for delete
  to authenticated
  using ((select public.is_admin()));

-- ------------------------------------------------------------
-- 2. system_config: configuración del sistema (solo ADMIN escribe)
-- ------------------------------------------------------------
create table if not exists public.system_config (
  key text primary key check (char_length(key) <= 64),
  value jsonb not null default '{}'::jsonb check (pg_column_size(value) <= 8192),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.system_config enable row level security;

drop policy if exists "system_config_public_read" on public.system_config;
create policy "system_config_public_read"
  on public.system_config
  for select
  to anon, authenticated
  using (true);

drop policy if exists "system_config_admin_insert" on public.system_config;
create policy "system_config_admin_insert"
  on public.system_config
  for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists "system_config_admin_update" on public.system_config;
create policy "system_config_admin_update"
  on public.system_config
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "system_config_admin_delete" on public.system_config;
create policy "system_config_admin_delete"
  on public.system_config
  for delete
  to authenticated
  using ((select public.is_admin()));

-- ------------------------------------------------------------
-- 3. Permisos de tabla
-- ------------------------------------------------------------
grant select, insert on public.processes to anon, authenticated;
grant update, delete on public.processes to authenticated;

grant select on public.system_config to anon, authenticated;
grant insert, update, delete on public.system_config to authenticated;

-- ============================================================
-- PRUEBAS DE SEGURIDAD (ejecutar aparte, una por una)
-- ============================================================
-- 1) Visitante inserta un proceso sandbox (debe funcionar):
--    begin;
--    set local role anon;
--    insert into public.processes (pid, name, state) values (1, 'prueba', 'READY');
--    rollback;
--
-- 2) Visitante NO puede escribir configuración (debe dar error RLS):
--    begin;
--    set local role anon;
--    insert into public.system_config (key, value) values ('x', '{}');
--    rollback;
