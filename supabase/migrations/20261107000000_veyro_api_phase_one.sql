create extension if not exists pgcrypto;

create table if not exists public.veyro_api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My API key',
  environment text not null check (environment in ('live','sandbox')),
  key_prefix text not null unique,
  key_hash text not null,
  verification_hash text not null,
  status text not null default 'active' check (status in ('active','revoked')),
  plan text not null default 'free',
  monthly_limit integer not null default 500 check (monthly_limit >= 0),
  requests_used integer not null default 0 check (requests_used >= 0),
  period_started_at date not null default date_trunc('month', now())::date,
  scopes text[] not null default array['airports:read','briefings:read','live:read']::text[],
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists veyro_api_keys_owner_created_idx on public.veyro_api_keys(owner_id, created_at desc);
create index if not exists veyro_api_keys_prefix_idx on public.veyro_api_keys(key_prefix) where status = 'active';

create table if not exists public.veyro_api_usage (
  id bigint generated always as identity primary key,
  key_id uuid references public.veyro_api_keys(id) on delete set null,
  endpoint text not null,
  method text not null,
  environment text not null check (environment in ('live','sandbox')),
  status_code integer not null,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists veyro_api_usage_key_created_idx on public.veyro_api_usage(key_id, created_at desc);
create index if not exists veyro_api_usage_created_idx on public.veyro_api_usage(created_at desc);

create table if not exists public.veyro_airports (
  icao text primary key check (icao ~ '^[A-Z0-9]{4}$'),
  iata text,
  name text not null,
  city text,
  country text,
  latitude double precision,
  longitude double precision,
  elevation_ft integer,
  source text not null default 'VEYRO',
  source_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists veyro_airports_iata_idx on public.veyro_airports(iata);
create index if not exists veyro_airports_name_idx on public.veyro_airports using gin (to_tsvector('simple', name));

create table if not exists public.veyro_airport_runways (
  id uuid primary key default gen_random_uuid(),
  airport_icao text not null references public.veyro_airports(icao) on delete cascade,
  identifier text not null,
  reciprocal_identifier text,
  length_ft integer,
  width_ft integer,
  surface text,
  heading_true double precision,
  heading_magnetic double precision,
  source text not null default 'VEYRO',
  updated_at timestamptz not null default now(),
  unique (airport_icao, identifier)
);
create index if not exists veyro_runways_airport_idx on public.veyro_airport_runways(airport_icao);

alter table public.veyro_api_keys enable row level security;
alter table public.veyro_api_usage enable row level security;
alter table public.veyro_airports enable row level security;
alter table public.veyro_airport_runways enable row level security;
revoke all on table public.veyro_api_keys from anon, authenticated;
revoke all on table public.veyro_api_usage from anon, authenticated;
revoke all on table public.veyro_airports from anon, authenticated;
revoke all on table public.veyro_airport_runways from anon, authenticated;
grant all on table public.veyro_api_keys to service_role;
grant all on table public.veyro_api_usage to service_role;
grant all on table public.veyro_airports to service_role;
grant all on table public.veyro_airport_runways to service_role;
grant usage, select on sequence public.veyro_api_usage_id_seq to service_role;
comment on table public.veyro_api_keys is 'VEYRO API credentials; only hashes are stored and raw secrets are shown once at creation.';
comment on table public.veyro_api_usage is 'Per-request usage records for VEYRO API keys.';
comment on table public.veyro_airports is 'Curated airport data served by VEYRO REST endpoints.';
comment on table public.veyro_airport_runways is 'Curated runway data associated with VEYRO airports.';
