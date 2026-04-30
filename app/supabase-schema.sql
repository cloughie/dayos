-- ============================================================
-- DayOS Supabase Schema
-- Run this in the Supabase SQL editor for your project.
-- ============================================================

-- User profiles
create table if not exists public.user_profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  preferred_name text not null default '',
  onboarding_notes text,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.user_profiles enable row level security;
create policy "Users can view own profile" on public.user_profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.user_profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.user_profiles for insert with check (auth.uid() = id);

-- Conversations
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  messages jsonb not null default '[]'::jsonb,
  mode text not null default 'checkin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, date)
);

alter table public.conversations enable row level security;
create policy "Users can manage own conversations" on public.conversations for all using (auth.uid() = user_id);

-- Plans
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  raw_text text not null,
  mindset_cue text,
  top_wins text,
  morning text,
  midday text,
  afternoon_evening text,
  optional text,
  guardrails text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, date)
);

alter table public.plans enable row level security;
create policy "Users can manage own plans" on public.plans for all using (auth.uid() = user_id);

-- Optional: trigger to auto-create user_profiles on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- User memories
create table if not exists public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  category text not null check (category in ('pattern', 'issue', 'decision', 'person', 'preference')),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_memories enable row level security;
create policy "Users can select own memories" on public.user_memories for select using (auth.uid() = user_id);
create policy "Users can insert own memories" on public.user_memories for insert with check (auth.uid() = user_id);
create policy "Users can update own memories" on public.user_memories for update using (auth.uid() = user_id);
create policy "Users can delete own memories" on public.user_memories for delete using (auth.uid() = user_id);
