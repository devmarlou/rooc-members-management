-- Row-managed app login, roles, first-login password reset, and audit logs.
-- Run this in Supabase SQL Editor for existing projects.

create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  role text not null check (role in ('super_admin', 'admin')),
  password_hash text not null,
  must_reset_password boolean not null default true,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_users_role_idx on app_users(role);
create index if not exists app_users_active_idx on app_users(is_active);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references app_users(id) on delete set null,
  actor_username text not null,
  actor_role text not null,
  action text not null,
  target_type text,
  target_id text,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on audit_logs(created_at desc);
create index if not exists audit_logs_actor_user_id_idx on audit_logs(actor_user_id);
create index if not exists audit_logs_action_idx on audit_logs(action);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_users_set_updated_at on app_users;
create trigger app_users_set_updated_at
before update on app_users
for each row execute function set_updated_at();

create or replace function verify_app_user_login(input_username text, input_password text)
returns table (
  id uuid,
  username text,
  role text,
  must_reset_password boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
  update app_users
  set last_login_at = now()
  where app_users.username = trim(input_username)
    and app_users.is_active = true
    and app_users.password_hash = extensions.crypt(input_password, app_users.password_hash)
  returning app_users.id, app_users.username, app_users.role, app_users.must_reset_password;
end;
$$;

create or replace function reset_app_user_password(input_user_id uuid, input_current_password text, input_new_password text)
returns table (
  id uuid,
  username text,
  role text,
  must_reset_password boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
  update app_users
  set
    password_hash = extensions.crypt(input_new_password, extensions.gen_salt('bf')),
    must_reset_password = false,
    updated_at = now()
  where app_users.id = input_user_id
    and app_users.is_active = true
    and app_users.password_hash = extensions.crypt(input_current_password, app_users.password_hash)
  returning app_users.id, app_users.username, app_users.role, app_users.must_reset_password;
end;
$$;

-- Create your owner account first:
-- insert into app_users (username, role, password_hash, must_reset_password)
-- values ('lou', 'super_admin', extensions.crypt('default-password-here', extensions.gen_salt('bf')), true);
--
-- Then create normal admins as needed:
-- insert into app_users (username, role, password_hash, must_reset_password)
-- values ('guild-admin', 'admin', extensions.crypt('default-password-here', extensions.gen_salt('bf')), true);
