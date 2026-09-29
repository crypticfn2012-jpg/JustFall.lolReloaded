-- Reloaded account/cosmetic persistence.
-- This schema does not contain or reproduce the original game's backend.
-- Keep the realtime gameplay loop on the WebSocket game server.

create table if not exists public.reloaded_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player',
  selected_skin integer not null default 0 check (selected_skin between 0 and 11),
  selected_cosmetic integer not null default 0 check (selected_cosmetic between 0 and 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reloaded_unlocks (
  user_id uuid primary key references public.reloaded_profiles(id) on delete cascade,
  all_skins boolean not null default true,
  all_cosmetics boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.reloaded_profiles enable row level security;
alter table public.reloaded_unlocks enable row level security;

create policy "profiles own row"
on public.reloaded_profiles for all
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "unlocks own row"
on public.reloaded_unlocks for select
using (auth.uid() = user_id);

create policy "unlocks own row update"
on public.reloaded_unlocks for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
