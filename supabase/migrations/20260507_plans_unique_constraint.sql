-- Enforce one plan row per user per date.
--
-- Before adding the unique constraint, remove any duplicate rows that
-- accumulated while the constraint was absent, keeping the latest
-- updated_at per (user_id, date) pair.

delete from plans
where id not in (
  select distinct on (user_id, date) id
  from plans
  order by user_id, date, updated_at desc
);

alter table plans
  add constraint plans_user_id_date_key unique (user_id, date);
