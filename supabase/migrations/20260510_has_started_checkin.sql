alter table user_profiles
  add column if not exists has_started_checkin boolean not null default false;
