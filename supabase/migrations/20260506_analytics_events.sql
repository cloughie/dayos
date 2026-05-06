-- Analytics events table
-- Tracks behavioural signals only: no content, no conversation text, no memory.

create table if not exists analytics_events (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null,
  event_type text        not null,
  created_at timestamptz not null default now(),
  metadata   jsonb       not null default '{}'
);

-- Indexes for dashboard queries
create index analytics_events_user_id_idx   on analytics_events (user_id);
create index analytics_events_event_type_idx on analytics_events (event_type);
create index analytics_events_created_at_idx on analytics_events (created_at desc);

-- Row Level Security
alter table analytics_events enable row level security;

-- Authenticated users may insert events for themselves only
create policy "Users can insert own events"
  on analytics_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Authenticated users may read their own events
-- (needed for server-side deduplication via user session)
create policy "Users can read own events"
  on analytics_events
  for select
  to authenticated
  using (auth.uid() = user_id);

-- No update or delete policies — events are immutable
-- Admin/reporting access uses the service role key (bypasses RLS)
