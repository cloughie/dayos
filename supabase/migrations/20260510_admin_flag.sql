-- Add is_admin flag to user_profiles
-- Grant admin access via: update user_profiles set is_admin = true where id = '<user-id>';
alter table user_profiles
  add column if not exists is_admin boolean not null default false;
