alter table user_profiles
  add column if not exists dev_tools_enabled boolean not null default false;
