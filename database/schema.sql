create extension if not exists pgcrypto;

-- أنواع النظام (السكربت قابل لإعادة التشغيل)
do $$ begin
  create type public.staff_role as enum ('owner','boss','hr','employee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.application_status as enum ('pending','preaccepted','profile_submitted','interview','accepted','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.application_status add value if not exists 'preaccepted';
  alter type public.application_status add value if not exists 'profile_submitted';
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.service_type as enum ('tool_sale','vehicle_mod');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.employment_status as enum ('active','suspended','terminated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.leave_status as enum ('pending','approved','rejected','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.resignation_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text unique not null,
  discord_username text,
  role public.staff_role not null default 'employee',
  game_name text,
  game_phone text,
  citizen_id text,
  is_active boolean not null default true,
  employment_status public.employment_status not null default 'active',
  status_reason text,
  status_changed_by_discord_id text,
  status_changed_at timestamptz,
  profile_complete boolean not null default false,
  hired_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ترقيات آمنة لو كان الجدول موجود من نسخة سابقة
alter table public.employees add column if not exists employment_status public.employment_status not null default 'active';
alter table public.employees add column if not exists status_reason text;
alter table public.employees add column if not exists status_changed_by_discord_id text;
alter table public.employees add column if not exists status_changed_at timestamptz;

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  public_code text unique not null default ('APP-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  applicant_name text not null,
  age integer,
  game_id text,
  discord_username text,
  discord_user_id text not null,
  experience text,
  availability text,
  reason text,
  profile_game_name text,
  profile_game_phone text,
  profile_citizen_id text,
  status public.application_status not null default 'pending',
  initial_reviewed_by_discord_id text,
  final_reviewed_by_discord_id text,
  reviewed_by_discord_id text,
  discord_message_id text,
  hr_message_id text,
  interview_channel_id text,
  discord_invite_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.applications alter column discord_username drop not null;
alter table public.applications add column if not exists profile_game_name text;
alter table public.applications add column if not exists profile_game_phone text;
alter table public.applications add column if not exists profile_citizen_id text;
alter table public.applications add column if not exists initial_reviewed_by_discord_id text;
alter table public.applications add column if not exists final_reviewed_by_discord_id text;
alter table public.applications add column if not exists hr_message_id text;
alter table public.applications add column if not exists interview_channel_id text;
alter table public.applications add column if not exists discord_invite_url text;

create index if not exists applications_discord_user_id_idx on public.applications(discord_user_id);
create index if not exists applications_status_idx on public.applications(status);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  forced_out boolean not null default false,
  forced_out_by_discord_id text,
  forced_out_reason text,
  created_at timestamptz not null default now()
);
create unique index if not exists one_open_shift_per_employee on public.attendance(employee_id) where clock_out is null;

create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  service_code text unique not null default ('JOB-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  employee_id uuid not null references public.employees(id) on delete cascade,
  service_type public.service_type not null,
  points integer not null check (points in (1,5)),
  invoice_amount numeric(14,2) not null default 0,
  invoice_image_url text not null,
  vehicle_image_url text,
  amount_source text not null default 'manual_confirmation',
  created_at timestamptz not null default now()
);

create table if not exists public.warnings (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  reason text not null,
  issued_by_discord_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  starts_on date,
  ends_on date,
  requested_days integer not null default 1 check (requested_days between 1 and 60),
  reason text,
  status public.leave_status not null default 'pending',
  reviewed_by_discord_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leave_requests alter column starts_on drop not null;
alter table public.leave_requests alter column ends_on drop not null;
alter table public.leave_requests add column if not exists requested_days integer not null default 1;
alter table public.leave_requests add column if not exists ended_early_at timestamptz;
alter table public.leave_requests add column if not exists auto_returned_at timestamptz;

create table if not exists public.resignation_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  reason text,
  status public.resignation_status not null default 'pending',
  reviewed_by_discord_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_cycles (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz,
  closed_by_discord_id text,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists one_current_cycle on public.weekly_cycles(is_current) where is_current = true;

create table if not exists public.weekly_snapshots (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.weekly_cycles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  tool_sales integer not null default 0,
  vehicle_mods integer not null default 0,
  points integer not null default 0,
  invoice_total numeric(14,2) not null default 0,
  resources_quantity integer not null default 0,
  created_at timestamptz not null default now(),
  unique(cycle_id, employee_id)
);

alter table public.weekly_snapshots add column if not exists resources_quantity integer not null default 0;

create table if not exists public.weekly_resource_deliveries (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.weekly_cycles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  quantity integer not null check (quantity >= 0),
  received_by_discord_id text not null,
  delivered_at timestamptz not null default now(),
  unique(cycle_id, employee_id)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_discord_id text,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.bot_settings (
  guild_id text not null,
  key text not null,
  value text not null,
  updated_by_discord_id text,
  updated_at timestamptz not null default now(),
  primary key (guild_id, key)
);

insert into public.weekly_cycles(starts_at, is_current)
select now(), true
where not exists (select 1 from public.weekly_cycles where is_current = true);

create or replace view public.current_week_stats as
select
  e.id as employee_id,
  e.discord_user_id,
  e.discord_username,
  e.game_name,
  count(s.id) filter (where s.service_type='tool_sale')::int as tool_sales,
  count(s.id) filter (where s.service_type='vehicle_mod')::int as vehicle_mods,
  coalesce(sum(s.points),0)::int as points,
  coalesce(sum(s.invoice_amount),0)::numeric(14,2) as invoice_total
from public.employees e
left join public.service_records s on s.employee_id=e.id
  and s.created_at >= (select starts_at from public.weekly_cycles where is_current=true limit 1)
group by e.id;

create or replace view public.lifetime_stats as
select
  e.id as employee_id,
  e.discord_user_id,
  e.discord_username,
  e.game_name,
  count(s.id) filter (where s.service_type='tool_sale')::int as tool_sales,
  count(s.id) filter (where s.service_type='vehicle_mod')::int as vehicle_mods,
  coalesce(sum(s.points),0)::int as points,
  coalesce(sum(s.invoice_amount),0)::numeric(14,2) as invoice_total
from public.employees e
left join public.service_records s on s.employee_id=e.id
group by e.id;

