-- Business Survival classroom sync
-- Run once in Supabase SQL editor.

create table if not exists public.game_teams (
  session_id text primary key,
  room_code text not null,
  team_name text not null,
  hp integer not null default 100 check (hp >= 0 and hp <= 100),
  status text not null default 'playing',
  question_index integer not null default 0,
  total_questions integer not null default 20,
  completed boolean not null default false,
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists game_teams_room_code_idx on public.game_teams(room_code);
create index if not exists game_teams_room_hp_idx on public.game_teams(room_code, hp desc);

alter table public.game_teams enable row level security;

-- Classroom game data contains team names/scores only. These policies intentionally
-- allow anonymous classroom clients to read and upsert scoreboard rows.
drop policy if exists "classroom teams read" on public.game_teams;
create policy "classroom teams read" on public.game_teams
for select to anon using (true);

drop policy if exists "classroom teams insert" on public.game_teams;
create policy "classroom teams insert" on public.game_teams
for insert to anon with check (true);

drop policy if exists "classroom teams update" on public.game_teams;
create policy "classroom teams update" on public.game_teams
for update to anon using (true) with check (true);
