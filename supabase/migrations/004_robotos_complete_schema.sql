-- ============================================================
-- RobotOS SmartHouse — Migración 004: Persistencia Completa
-- ============================================================
-- Requisitos previos: 002_robotos_telemetry.sql y
--                     003_robotos_processes_config.sql ya ejecutadas.
-- Esta migración es IDEMPOTENTE: se puede ejecutar más de una vez
-- sin errores gracias a "if not exists" y "drop policy if exists".
--
-- IMPORTANTE: ejecutar como superusuario (Supabase SQL Editor, rol postgres).
-- NO modifica las tablas existentes: kernel_events, boot_history,
-- processes, system_config, user_roles.
--
-- Modelo de acceso (igual que 002/003):
--   * Lectura pública: anon y authenticated.
--   * INSERT origin='sandbox': permitido a todos sin cuenta.
--   * INSERT origin='admin' o UPDATE/DELETE: solo is_admin().
-- ============================================================

-- Asegurar que el esquema public está accesible
grant usage on schema public to anon, authenticated;

-- ============================================================
-- 1. cpu_history
-- ============================================================
create table if not exists public.cpu_history (
  id                  uuid        primary key default gen_random_uuid(),
  ticks               integer     not null default 0,
  algorithm           text        not null default 'PRIORITY'
                                  check (char_length(algorithm) <= 64),
  quantum             integer     default 4,
  utilization         numeric     not null default 0,
  waiting_time_avg    numeric     not null default 0,
  turnaround_time_avg numeric     not null default 0,
  response_time_avg   numeric     not null default 0,
  throughput          numeric     not null default 0,
  context_switches    integer     not null default 0,
  recorded_at         timestamptz not null default now(),
  session_id          text,
  origin              text        not null default 'sandbox'
                                  check (origin in ('sandbox', 'admin')),
  created_at          timestamptz not null default now()
);

create index if not exists cpu_history_recorded_at_idx on public.cpu_history (recorded_at desc);
create index if not exists cpu_history_session_idx     on public.cpu_history (session_id);

alter table public.cpu_history enable row level security;

drop policy if exists "cpu_history_public_read"   on public.cpu_history;
drop policy if exists "cpu_history_insert"        on public.cpu_history;
drop policy if exists "cpu_history_admin_update"  on public.cpu_history;
drop policy if exists "cpu_history_admin_delete"  on public.cpu_history;

create policy "cpu_history_public_read"
  on public.cpu_history for select
  to anon, authenticated using (true);

create policy "cpu_history_insert"
  on public.cpu_history for insert
  to anon, authenticated
  with check (origin = 'sandbox' or (select public.is_admin()));

create policy "cpu_history_admin_update"
  on public.cpu_history for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "cpu_history_admin_delete"
  on public.cpu_history for delete
  to authenticated
  using ((select public.is_admin()));

grant select, insert on public.cpu_history to anon, authenticated;
grant update, delete on public.cpu_history to authenticated;

-- ============================================================
-- 2. memory_allocations
-- ============================================================
create table if not exists public.memory_allocations (
  id                    uuid        primary key default gen_random_uuid(),
  pid                   integer,
  process_name          text        not null
                                    check (char_length(process_name) <= 64),
  allocated_blocks      integer     not null default 0,
  allocated_mb          integer     not null default 0,
  action                text        not null
                                    check (action in ('ALLOCATE', 'FREE', 'FRAGMENTATION_CHECK')),
  fragmentation_percent numeric     not null default 0,
  recorded_at           timestamptz not null default now(),
  session_id            text,
  origin                text        not null default 'sandbox'
                                    check (origin in ('sandbox', 'admin')),
  created_at            timestamptz not null default now()
);

create index if not exists memory_allocations_recorded_at_idx on public.memory_allocations (recorded_at desc);
create index if not exists memory_allocations_pid_idx         on public.memory_allocations (pid);
create index if not exists memory_allocations_session_idx     on public.memory_allocations (session_id);

alter table public.memory_allocations enable row level security;

drop policy if exists "memory_allocations_public_read"  on public.memory_allocations;
drop policy if exists "memory_allocations_insert"       on public.memory_allocations;
drop policy if exists "memory_allocations_admin_update" on public.memory_allocations;
drop policy if exists "memory_allocations_admin_delete" on public.memory_allocations;

create policy "memory_allocations_public_read"
  on public.memory_allocations for select
  to anon, authenticated using (true);

create policy "memory_allocations_insert"
  on public.memory_allocations for insert
  to anon, authenticated
  with check (origin = 'sandbox' or (select public.is_admin()));

create policy "memory_allocations_admin_update"
  on public.memory_allocations for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "memory_allocations_admin_delete"
  on public.memory_allocations for delete
  to authenticated
  using ((select public.is_admin()));

grant select, insert on public.memory_allocations to anon, authenticated;
grant update, delete on public.memory_allocations to authenticated;

-- ============================================================
-- 3. page_faults
-- ============================================================
create table if not exists public.page_faults (
  id                      uuid        primary key default gen_random_uuid(),
  pid                     integer     not null,
  virtual_address         numeric,
  page_number             integer     not null,
  frame_id                integer,
  replacement_algorithm   text        not null default 'FIFO'
                                      check (replacement_algorithm in ('FIFO', 'LRU')),
  victim_page             integer,
  recorded_at             timestamptz not null default now(),
  session_id              text,
  origin                  text        not null default 'sandbox'
                                      check (origin in ('sandbox', 'admin')),
  created_at              timestamptz not null default now()
);

create index if not exists page_faults_recorded_at_idx on public.page_faults (recorded_at desc);
create index if not exists page_faults_pid_idx         on public.page_faults (pid);
create index if not exists page_faults_session_idx     on public.page_faults (session_id);

alter table public.page_faults enable row level security;

drop policy if exists "page_faults_public_read"  on public.page_faults;
drop policy if exists "page_faults_insert"       on public.page_faults;
drop policy if exists "page_faults_admin_update" on public.page_faults;
drop policy if exists "page_faults_admin_delete" on public.page_faults;

create policy "page_faults_public_read"
  on public.page_faults for select
  to anon, authenticated using (true);

create policy "page_faults_insert"
  on public.page_faults for insert
  to anon, authenticated
  with check (origin = 'sandbox' or (select public.is_admin()));

create policy "page_faults_admin_update"
  on public.page_faults for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "page_faults_admin_delete"
  on public.page_faults for delete
  to authenticated
  using ((select public.is_admin()));

grant select, insert on public.page_faults to anon, authenticated;
grant update, delete on public.page_faults to authenticated;

-- ============================================================
-- 4. filesystem_nodes
-- ============================================================
create table if not exists public.filesystem_nodes (
  id          uuid        primary key default gen_random_uuid(),
  path        text        not null unique
                          check (char_length(path) <= 256),
  name        text        not null
                          check (char_length(name) <= 128),
  type        text        not null
                          check (type in ('FILE', 'DIRECTORY')),
  size        text        not null default '0 B',
  permissions text        not null default 'rw-r--r--',
  modified_at timestamptz not null default now(),
  session_id  text,
  origin      text        not null default 'sandbox'
                          check (origin in ('sandbox', 'admin')),
  created_at  timestamptz not null default now()
);

create index if not exists filesystem_nodes_path_idx    on public.filesystem_nodes (path);
create index if not exists filesystem_nodes_session_idx on public.filesystem_nodes (session_id);

alter table public.filesystem_nodes enable row level security;

drop policy if exists "filesystem_nodes_public_read"  on public.filesystem_nodes;
drop policy if exists "filesystem_nodes_insert"       on public.filesystem_nodes;
drop policy if exists "filesystem_nodes_update"       on public.filesystem_nodes;
drop policy if exists "filesystem_nodes_admin_delete" on public.filesystem_nodes;

create policy "filesystem_nodes_public_read"
  on public.filesystem_nodes for select
  to anon, authenticated using (true);

create policy "filesystem_nodes_insert"
  on public.filesystem_nodes for insert
  to anon, authenticated
  with check (origin = 'sandbox' or (select public.is_admin()));

create policy "filesystem_nodes_update"
  on public.filesystem_nodes for update
  to anon, authenticated
  using  (origin = 'sandbox' or (select public.is_admin()))
  with check (origin = 'sandbox' or (select public.is_admin()));

create policy "filesystem_nodes_admin_delete"
  on public.filesystem_nodes for delete
  to authenticated
  using ((select public.is_admin()));

grant select, insert, update on public.filesystem_nodes to anon, authenticated;
grant delete                 on public.filesystem_nodes to authenticated;

-- ============================================================
-- 5. devices
-- ============================================================
create table if not exists public.devices (
  id            text        primary key check (char_length(id) <= 64),
  name          text        not null check (char_length(name) <= 128),
  type          text        not null check (char_length(type) <= 64),
  zone          text        not null check (char_length(zone) <= 64),
  status        text        not null check (char_length(status) <= 64),
  is_common_area boolean   not null default false,
  last_seen     timestamptz not null default now(),
  session_id    text,
  origin        text        not null default 'sandbox'
                            check (origin in ('sandbox', 'admin')),
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists devices_zone_idx   on public.devices (zone);
create index if not exists devices_status_idx on public.devices (status);

alter table public.devices enable row level security;

drop policy if exists "devices_public_read"  on public.devices;
drop policy if exists "devices_insert"       on public.devices;
drop policy if exists "devices_update"       on public.devices;
drop policy if exists "devices_admin_delete" on public.devices;

create policy "devices_public_read"
  on public.devices for select
  to anon, authenticated using (true);

create policy "devices_insert"
  on public.devices for insert
  to anon, authenticated
  with check (origin = 'sandbox' or (select public.is_admin()));

create policy "devices_update"
  on public.devices for update
  to anon, authenticated
  using  (origin = 'sandbox' or (select public.is_admin()))
  with check (origin = 'sandbox' or (select public.is_admin()));

create policy "devices_admin_delete"
  on public.devices for delete
  to authenticated
  using ((select public.is_admin()));

grant select, insert, update on public.devices to anon, authenticated;
grant delete                 on public.devices to authenticated;

-- ============================================================
-- 6. sensor_readings
-- ============================================================
create table if not exists public.sensor_readings (
  id           uuid        primary key default gen_random_uuid(),
  device_id    text        not null check (char_length(device_id) <= 64),
  reading_type text        not null check (char_length(reading_type) <= 64),
  value        numeric,
  unit         text        check (char_length(unit) <= 16),
  status       text        check (char_length(status) <= 64),
  recorded_at  timestamptz not null default now(),
  session_id   text,
  origin       text        not null default 'sandbox'
                           check (origin in ('sandbox', 'admin')),
  created_at   timestamptz not null default now()
);

create index if not exists sensor_readings_device_idx      on public.sensor_readings (device_id);
create index if not exists sensor_readings_recorded_at_idx on public.sensor_readings (recorded_at desc);

alter table public.sensor_readings enable row level security;

drop policy if exists "sensor_readings_public_read"  on public.sensor_readings;
drop policy if exists "sensor_readings_insert"       on public.sensor_readings;
drop policy if exists "sensor_readings_admin_delete" on public.sensor_readings;

create policy "sensor_readings_public_read"
  on public.sensor_readings for select
  to anon, authenticated using (true);

create policy "sensor_readings_insert"
  on public.sensor_readings for insert
  to anon, authenticated
  with check (origin = 'sandbox' or (select public.is_admin()));

create policy "sensor_readings_admin_delete"
  on public.sensor_readings for delete
  to authenticated
  using ((select public.is_admin()));

grant select, insert on public.sensor_readings to anon, authenticated;
grant delete         on public.sensor_readings to authenticated;

-- ============================================================
-- 7. logs
-- ============================================================
create table if not exists public.logs (
  id          uuid        primary key default gen_random_uuid(),
  log_id      text        not null,
  timestamp   text        not null,
  level       text        not null
                          check (level in ('INFO', 'WARN', 'ERROR', 'DEBUG', 'CRITICAL')),
  source      text        not null check (char_length(source) <= 64),
  message     text        not null check (char_length(message) <= 2048),
  recorded_at timestamptz not null default now(),
  session_id  text,
  origin      text        not null default 'sandbox'
                          check (origin in ('sandbox', 'admin')),
  created_at  timestamptz not null default now()
);

create index if not exists logs_recorded_at_idx on public.logs (recorded_at desc);
create index if not exists logs_level_idx       on public.logs (level);
create index if not exists logs_session_idx     on public.logs (session_id);

alter table public.logs enable row level security;

drop policy if exists "logs_public_read"  on public.logs;
drop policy if exists "logs_insert"       on public.logs;
drop policy if exists "logs_admin_delete" on public.logs;

create policy "logs_public_read"
  on public.logs for select
  to anon, authenticated using (true);

create policy "logs_insert"
  on public.logs for insert
  to anon, authenticated
  with check (origin = 'sandbox' or (select public.is_admin()));

create policy "logs_admin_delete"
  on public.logs for delete
  to authenticated
  using ((select public.is_admin()));

grant select, insert on public.logs to anon, authenticated;
grant delete         on public.logs to authenticated;

-- ============================================================
-- 8. alerts
-- ============================================================
create table if not exists public.alerts (
  id          uuid        primary key default gen_random_uuid(),
  alert_id    text        not null,
  title       text        not null check (char_length(title) <= 256),
  details     text,
  severity    text        not null
                          check (severity in ('LOW','MEDIUM','HIGH','CRITICAL',
                                              'Baja','Media','Alta','Crítica')),
  state       text        not null
                          check (state in ('ACTIVE','ACKNOWLEDGED','RESOLVED',
                                           'Activa','Reconocida','Resuelta')),
  recorded_at timestamptz not null default now(),
  session_id  text,
  origin      text        not null default 'sandbox'
                          check (origin in ('sandbox', 'admin')),
  created_at  timestamptz not null default now()
);

create index if not exists alerts_recorded_at_idx on public.alerts (recorded_at desc);
create index if not exists alerts_state_idx       on public.alerts (state);

alter table public.alerts enable row level security;

drop policy if exists "alerts_public_read"  on public.alerts;
drop policy if exists "alerts_insert"       on public.alerts;
drop policy if exists "alerts_admin_update" on public.alerts;
drop policy if exists "alerts_admin_delete" on public.alerts;

create policy "alerts_public_read"
  on public.alerts for select
  to anon, authenticated using (true);

create policy "alerts_insert"
  on public.alerts for insert
  to anon, authenticated
  with check (origin = 'sandbox' or (select public.is_admin()));

create policy "alerts_admin_update"
  on public.alerts for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "alerts_admin_delete"
  on public.alerts for delete
  to authenticated
  using ((select public.is_admin()));

grant select, insert on public.alerts to anon, authenticated;
grant update, delete on public.alerts to authenticated;

-- ============================================================
-- 9. injected_faults
-- ============================================================
create table if not exists public.injected_faults (
  id          uuid        primary key default gen_random_uuid(),
  fault_type  text        not null check (char_length(fault_type) <= 64),
  target      text        not null check (char_length(target) <= 128),
  status      text        not null
                          check (status in ('INJECTED','ACTIVE','RESOLVED','FAILED')),
  details     jsonb       not null default '{}'::jsonb
                          check (pg_column_size(details) <= 8192),
  injected_at timestamptz not null default now(),
  resolved_at timestamptz,
  session_id  text,
  origin      text        not null default 'sandbox'
                          check (origin in ('sandbox', 'admin')),
  created_at  timestamptz not null default now()
);

create index if not exists injected_faults_injected_at_idx on public.injected_faults (injected_at desc);
create index if not exists injected_faults_status_idx      on public.injected_faults (status);

alter table public.injected_faults enable row level security;

drop policy if exists "injected_faults_public_read"  on public.injected_faults;
drop policy if exists "injected_faults_insert"       on public.injected_faults;
drop policy if exists "injected_faults_admin_update" on public.injected_faults;
drop policy if exists "injected_faults_admin_delete" on public.injected_faults;

create policy "injected_faults_public_read"
  on public.injected_faults for select
  to anon, authenticated using (true);

create policy "injected_faults_insert"
  on public.injected_faults for insert
  to anon, authenticated
  with check (origin = 'sandbox' or (select public.is_admin()));

create policy "injected_faults_admin_update"
  on public.injected_faults for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "injected_faults_admin_delete"
  on public.injected_faults for delete
  to authenticated
  using ((select public.is_admin()));

grant select, insert on public.injected_faults to anon, authenticated;
grant update, delete on public.injected_faults to authenticated;

-- ============================================================
-- 10. benchmark_runs
-- ============================================================
create table if not exists public.benchmark_runs (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null check (char_length(name) <= 128),
  algorithm       text        not null check (char_length(algorithm) <= 64),
  quantum         integer     default 4,
  duration_ticks  integer     not null default 0,
  run_at          timestamptz not null default now(),
  session_id      text,
  origin          text        not null default 'sandbox'
                              check (origin in ('sandbox', 'admin')),
  created_at      timestamptz not null default now()
);

create index if not exists benchmark_runs_run_at_idx on public.benchmark_runs (run_at desc);

alter table public.benchmark_runs enable row level security;

drop policy if exists "benchmark_runs_public_read"  on public.benchmark_runs;
drop policy if exists "benchmark_runs_insert"       on public.benchmark_runs;
drop policy if exists "benchmark_runs_admin_delete" on public.benchmark_runs;

create policy "benchmark_runs_public_read"
  on public.benchmark_runs for select
  to anon, authenticated using (true);

create policy "benchmark_runs_insert"
  on public.benchmark_runs for insert
  to anon, authenticated
  with check (origin = 'sandbox' or (select public.is_admin()));

create policy "benchmark_runs_admin_delete"
  on public.benchmark_runs for delete
  to authenticated
  using ((select public.is_admin()));

grant select, insert on public.benchmark_runs to anon, authenticated;
grant delete         on public.benchmark_runs to authenticated;

-- ============================================================
-- 11. benchmark_results
-- ============================================================
create table if not exists public.benchmark_results (
  id           uuid        primary key default gen_random_uuid(),
  run_id       uuid        references public.benchmark_runs(id) on delete cascade,
  metric_name  text        not null check (char_length(metric_name) <= 64),
  metric_value numeric     not null,
  details      jsonb       not null default '{}'::jsonb
                           check (pg_column_size(details) <= 8192),
  recorded_at  timestamptz not null default now(),
  session_id   text,
  origin       text        not null default 'sandbox'
                           check (origin in ('sandbox', 'admin')),
  created_at   timestamptz not null default now()
);

create index if not exists benchmark_results_run_id_idx on public.benchmark_results (run_id);

alter table public.benchmark_results enable row level security;

drop policy if exists "benchmark_results_public_read"  on public.benchmark_results;
drop policy if exists "benchmark_results_insert"       on public.benchmark_results;
drop policy if exists "benchmark_results_admin_delete" on public.benchmark_results;

create policy "benchmark_results_public_read"
  on public.benchmark_results for select
  to anon, authenticated using (true);

create policy "benchmark_results_insert"
  on public.benchmark_results for insert
  to anon, authenticated
  with check (origin = 'sandbox' or (select public.is_admin()));

create policy "benchmark_results_admin_delete"
  on public.benchmark_results for delete
  to authenticated
  using ((select public.is_admin()));

grant select, insert on public.benchmark_results to anon, authenticated;
grant delete         on public.benchmark_results to authenticated;

-- ============================================================
-- VALIDACIÓN: ejecutar estas consultas DESPUÉS de la migración
-- para confirmar que todas las tablas fueron creadas.
-- ============================================================

-- A. Verificar existencia de las 11 tablas nuevas
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'cpu_history', 'memory_allocations', 'page_faults',
    'filesystem_nodes', 'devices', 'sensor_readings',
    'logs', 'alerts', 'injected_faults',
    'benchmark_runs', 'benchmark_results'
  )
order by table_name;
-- Resultado esperado: 11 filas, una por tabla.

-- B. Verificar que RLS está activo en cada tabla nueva
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'cpu_history', 'memory_allocations', 'page_faults',
    'filesystem_nodes', 'devices', 'sensor_readings',
    'logs', 'alerts', 'injected_faults',
    'benchmark_runs', 'benchmark_results'
  )
order by tablename;
-- Resultado esperado: rowsecurity = true en las 11 filas.

-- C. Conteo total por tabla (para verificar datos después de usar la app)
select 'cpu_history'         as tabla, count(*) as filas from public.cpu_history
union all
select 'memory_allocations',           count(*) from public.memory_allocations
union all
select 'page_faults',                  count(*) from public.page_faults
union all
select 'filesystem_nodes',             count(*) from public.filesystem_nodes
union all
select 'devices',                      count(*) from public.devices
union all
select 'sensor_readings',              count(*) from public.sensor_readings
union all
select 'logs',                         count(*) from public.logs
union all
select 'alerts',                       count(*) from public.alerts
union all
select 'injected_faults',              count(*) from public.injected_faults
union all
select 'benchmark_runs',               count(*) from public.benchmark_runs
union all
select 'benchmark_results',            count(*) from public.benchmark_results
order by tabla;
