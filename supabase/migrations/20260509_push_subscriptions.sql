-- Push subscription storage for Web Push notifications
-- One row per user (latest subscription wins; old ones are replaced on re-subscribe).

create table if not exists push_subscriptions (
  id                      uuid        primary key default gen_random_uuid(),
  user_id                 uuid        not null unique references auth.users(id) on delete cascade,
  endpoint                text        not null,
  p256dh                  text        not null,
  auth                    text        not null,
  timezone                text        not null default 'UTC',
  last_notification_body  text,
  last_sent_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on push_subscriptions (user_id);

-- Row Level Security
alter table push_subscriptions enable row level security;

-- Users may manage only their own subscription
create policy "Users can manage own push subscription"
  on push_subscriptions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admin/cron access uses the service role key (bypasses RLS)
