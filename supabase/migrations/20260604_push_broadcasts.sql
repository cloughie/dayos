-- Broadcast push log — one row per admin-triggered broadcast.
-- Populated by the /api/admin/push-broadcast route using the service role key.
-- Regular users have no access; admin reads via service role (bypasses RLS).

create table if not exists push_broadcasts (
  id                uuid        primary key default gen_random_uuid(),
  title             text        not null,
  body              text        not null,
  destination_path  text        not null,
  total_recipients  int         not null default 0,
  sent_count        int         not null default 0,
  failed_count      int         not null default 0,
  expired_count     int         not null default 0,
  sent_by_user_id   uuid        references auth.users(id),
  created_at        timestamptz not null default now()
);

create index push_broadcasts_created_at_idx on push_broadcasts (created_at desc);

alter table push_broadcasts enable row level security;
-- No policies — only the service role key may read/write this table.
