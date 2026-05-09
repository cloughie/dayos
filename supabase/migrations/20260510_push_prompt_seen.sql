alter table user_profiles
  add column if not exists has_seen_push_prompt boolean not null default false;
