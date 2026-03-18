create extension if not exists pgcrypto;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'lobby',
  phase text not null default 'lobby',
  version integer not null default 0,
  current_seat_index integer,
  idle_deadline_at timestamptz,
  snapshot jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.seats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  seat_index integer not null,
  name text,
  is_host boolean not null default false,
  invite_token_hash text not null,
  claimed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (game_id, seat_index)
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  seat_id uuid not null references public.seats(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  version integer not null,
  seat_id uuid references public.seats(id) on delete set null,
  client_action_id text not null,
  action jsonb not null,
  summary jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (game_id, client_action_id),
  unique (game_id, version)
);

create index if not exists seats_invite_token_hash_idx on public.seats (invite_token_hash);
create index if not exists sessions_game_id_idx on public.sessions (game_id);
create index if not exists sessions_token_hash_idx on public.sessions (token_hash);
create index if not exists events_game_id_created_at_idx on public.events (game_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists games_touch_updated_at on public.games;
create trigger games_touch_updated_at
before update on public.games
for each row execute procedure public.touch_updated_at();

drop trigger if exists seats_touch_updated_at on public.seats;
create trigger seats_touch_updated_at
before update on public.seats
for each row execute procedure public.touch_updated_at();

alter table public.games enable row level security;
alter table public.seats enable row level security;
alter table public.sessions enable row level security;
alter table public.events enable row level security;
