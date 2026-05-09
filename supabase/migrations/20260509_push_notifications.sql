-- Add push notification preference columns to user_profiles
alter table user_profiles
  add column if not exists push_notifications_enabled boolean not null default false,
  add column if not exists push_notifications_permission_status text not null default 'default';
