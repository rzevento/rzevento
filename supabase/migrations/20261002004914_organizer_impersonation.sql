-- Actor authentication is never replaced. A tab opts into an expiring, event-scoped
-- session; invalid/expired sessions fail closed instead of regaining admin access.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table private.organizer_impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  subject_id uuid not null references auth.users(id),
  auth_session_id uuid not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  ended_at timestamptz,
  check (actor_id <> subject_id)
);
alter table private.organizer_impersonation_sessions enable row level security;
revoke all on private.organizer_impersonation_sessions from public, anon, authenticated;
create index organizer_impersonation_actor_idx on private.organizer_impersonation_sessions(actor_id);

create function private.request_impersonation_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb ->> 'x-rz-impersonation', '')::uuid;
$$;

create function private.impersonation_session()
returns private.organizer_impersonation_sessions
language plpgsql stable security definer set search_path = '' as $$
declare s private.organizer_impersonation_sessions;
begin
  if private.request_impersonation_id() is null then return null; end if;
  select * into s from private.organizer_impersonation_sessions
  where id = private.request_impersonation_id() and actor_id = auth.uid()
    and auth_session_id::text = (auth.jwt() ->> 'session_id')
    and ended_at is null and expires_at > now();
  if s.id is null or not exists (
    select 1 from auth.sessions where id = s.auth_session_id and user_id = s.actor_id
  ) or not exists (
    select 1 from public.event_members where event_id = s.event_id and user_id = s.actor_id and role = 'admin'
  ) or not exists (
    select 1 from public.event_members where event_id = s.event_id and user_id = s.subject_id
  ) then
    raise exception 'La sesión de impersonación terminó o ya no está autorizada. Vuelve a tu cuenta.' using errcode = '42501';
  end if;
  return s;
end;
$$;

create function private.organizer_effective_uid(target_event_id uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare s private.organizer_impersonation_sessions;
begin
  if private.request_impersonation_id() is null then return auth.uid(); end if;
  s := private.impersonation_session();
  if s.event_id <> target_event_id then return null; end if;
  return s.subject_id;
end;
$$;

create or replace function public.is_event_member(target_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.event_members
    where event_id = target_event_id and user_id = private.organizer_effective_uid(target_event_id));
$$;

create function private.organizer_context(target_event_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_event uuid;
  v_actor uuid := auth.uid();
  v_effective uuid;
  member public.event_members;
  s private.organizer_impersonation_sessions;
begin
  if v_actor is null then raise exception 'Inicia sesión' using errcode = '42501'; end if;
  s := private.impersonation_session();
  if s.id is not null then
    v_event := s.event_id;
    if target_event_id is not null and target_event_id <> v_event then
      raise exception 'Evento fuera de la sesión' using errcode = '42501';
    end if;
  else
    select e.id into v_event from public.events e
    join public.event_members m on m.event_id = e.id and m.user_id = v_actor
    where target_event_id is null or e.id = target_event_id
    order by e.created_at desc limit 1;
  end if;
  v_effective := private.organizer_effective_uid(v_event);
  select * into member from public.event_members where event_id = v_event and user_id = v_effective;
  if member.user_id is null then raise exception 'Sin acceso al evento' using errcode = '42501'; end if;
  return jsonb_build_object(
    'eventId', v_event, 'userId', v_effective, 'actorUserId', v_actor,
    'actorIsAdmin', exists(select 1 from public.event_members where event_id = v_event and user_id = v_actor and role = 'admin'),
    'displayName', coalesce(nullif(trim(member.display_name), ''), (select coalesce(nullif(raw_user_meta_data->>'full_name', ''), nullif(raw_user_meta_data->>'name', '')) from auth.users where id = v_effective), member.email, 'Organizador'),
    'roleCode', member.role,
    'role', case member.role when 'admin' then 'Administrador' when 'staff' then 'Equipo' when 'viewer' then 'Consulta' else member.role end,
    'impersonationId', s.id, 'expiresAt', s.expires_at
  );
end;
$$;

create function private.start_organizer_impersonation(target_event_id uuid, subject_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s private.organizer_impersonation_sessions;
begin
  if auth.uid() is null or private.request_impersonation_id() is not null or not exists (
    select 1 from public.event_members where event_id = target_event_id and user_id = auth.uid() and role = 'admin'
  ) then raise exception 'Solo un administrador en su propia sesión puede impersonar' using errcode = '42501'; end if;
  if subject_user_id = auth.uid() or not exists (
    select 1 from public.event_members where event_id = target_event_id and user_id = subject_user_id
  ) then raise exception 'Selecciona otro usuario de este evento' using errcode = '42501'; end if;
  if not exists (select 1 from auth.sessions where id::text = (auth.jwt() ->> 'session_id') and user_id = auth.uid()) then
    raise exception 'La sesión de acceso ya no es válida' using errcode = '42501';
  end if;
  insert into private.organizer_impersonation_sessions(event_id, actor_id, subject_id, auth_session_id)
    values (target_event_id, auth.uid(), subject_user_id, (auth.jwt() ->> 'session_id')::uuid) returning * into s;
  insert into public.activity_log(event_id, action, actor_id, metadata)
    values (target_event_id, 'impersonation_started', auth.uid(), jsonb_build_object('subject_id', subject_user_id, 'session_id', s.id, 'expires_at', s.expires_at));
  return jsonb_build_object('id', s.id, 'expiresAt', s.expires_at);
end;
$$;

create function private.stop_organizer_impersonation(impersonation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s private.organizer_impersonation_sessions;
begin
  if auth.uid() is null then raise exception 'Inicia sesión' using errcode = '42501'; end if;
  update private.organizer_impersonation_sessions set ended_at = now()
    where id = impersonation_id and actor_id = auth.uid()
      and auth_session_id::text = (auth.jwt() ->> 'session_id') and ended_at is null returning * into s;
  if s.id is not null then
    insert into public.activity_log(event_id, action, actor_id, metadata)
      values (s.event_id, 'impersonation_stopped', auth.uid(), jsonb_build_object('subject_id', s.subject_id, 'session_id', s.id));
  end if;
end;
$$;

create function public.get_organizer_context(target_event_id uuid default null) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.organizer_context(target_event_id); $$;
create function public.start_organizer_impersonation(target_event_id uuid, subject_user_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.start_organizer_impersonation(target_event_id, subject_user_id); $$;
create function public.stop_organizer_impersonation(impersonation_id uuid) returns void
language sql security invoker set search_path = '' as $$ select private.stop_organizer_impersonation(impersonation_id); $$;

-- The member-management RPC must authorize the effective user, with a NULL-safe denial.
create or replace function public.add_event_member(target_event_id uuid, member_email text, member_display_name text, member_role text)
returns json language plpgsql security definer set search_path = '' as $$
declare caller_role text; member_user_id uuid; member_row public.event_members;
begin
  select role into caller_role from public.event_members
    where event_id = target_event_id and user_id = private.organizer_effective_uid(target_event_id);
  if caller_role is distinct from 'admin' then raise exception 'Only admins can manage event members' using errcode = '42501'; end if;
  if member_role is null or member_role not in ('admin', 'staff', 'viewer') then raise exception 'Invalid member role'; end if;
  select id into member_user_id from auth.users where lower(email) = lower(trim(member_email));
  if member_user_id is null then raise exception 'Auth user not found'; end if;
  insert into public.event_members (event_id, user_id, email, display_name, role)
    values (target_event_id, member_user_id, lower(trim(member_email)), nullif(trim(member_display_name), ''), member_role)
    on conflict (event_id, user_id) do update set email = excluded.email, display_name = excluded.display_name, role = excluded.role
    returning * into member_row;
  return row_to_json(member_row);
end;
$$;

-- Immutable audit entries contain the real actor and the effective user. No guest
-- contact information is duplicated and deletes cannot erase this attribution.
create function private.audit_impersonated_action() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s private.organizer_impersonation_sessions; row_data jsonb; v_event uuid;
begin
  if private.request_impersonation_id() is not null then
    s := private.impersonation_session();
    if tg_op = 'DELETE' then row_data := to_jsonb(old); else row_data := to_jsonb(new); end if;
    v_event := (row_data ->> 'event_id')::uuid;
    if v_event is distinct from s.event_id then raise exception 'Evento fuera de la sesión' using errcode = '42501'; end if;
    insert into public.activity_log(event_id, action, actor_id, metadata)
      values (v_event, 'impersonated_' || lower(tg_op), auth.uid(), jsonb_build_object(
        'subject_id', s.subject_id, 'session_id', s.id, 'table', tg_table_name,
        'record_id', coalesce(row_data ->> 'id', row_data ->> 'user_id')));
  end if;
  return null;
end;
$$;
create trigger audit_impersonated_guests after insert or update or delete on public.guests for each row execute function private.audit_impersonated_action();
create trigger audit_impersonated_invitations after insert or update or delete on public.invitations for each row execute function private.audit_impersonated_action();
create trigger audit_impersonated_rsvps after insert or update or delete on public.rsvps for each row execute function private.audit_impersonated_action();
create trigger audit_impersonated_check_ins after insert or update or delete on public.check_ins for each row execute function private.audit_impersonated_action();
create trigger audit_impersonated_members after insert or update or delete on public.event_members for each row execute function private.audit_impersonated_action();

revoke all on function private.request_impersonation_id(), private.impersonation_session(), private.organizer_effective_uid(uuid), private.organizer_context(uuid), private.start_organizer_impersonation(uuid, uuid), private.stop_organizer_impersonation(uuid), private.audit_impersonated_action() from public, anon, authenticated;
grant execute on function private.organizer_context(uuid), private.start_organizer_impersonation(uuid, uuid), private.stop_organizer_impersonation(uuid) to authenticated;
revoke all on function public.get_organizer_context(uuid), public.start_organizer_impersonation(uuid, uuid), public.stop_organizer_impersonation(uuid), public.is_event_member(uuid), public.add_event_member(uuid,text,text,text) from public, anon;
grant execute on function public.get_organizer_context(uuid), public.start_organizer_impersonation(uuid, uuid), public.stop_organizer_impersonation(uuid), public.is_event_member(uuid), public.add_event_member(uuid,text,text,text) to authenticated;

create function private.record_organizer_email_attempt(target_guest_id uuid, is_resend boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_event uuid; v_user uuid; v_role text;
begin
  select event_id into v_event from public.guests where id = target_guest_id;
  v_user := private.organizer_effective_uid(v_event);
  select role into v_role from public.event_members where event_id = v_event and user_id = v_user;
  if v_role is distinct from 'admin' then raise exception 'Solo un administrador puede enviar invitaciones' using errcode = '42501'; end if;
  insert into public.activity_log(event_id, guest_id, action, actor_id, metadata)
    values(v_event, target_guest_id, 'invitation_email_attempt', auth.uid(), jsonb_build_object(
      'subject_id', v_user, 'session_id', private.request_impersonation_id(), 'resend', is_resend));
end;
$$;
create function public.record_organizer_email_attempt(target_guest_id uuid, is_resend boolean default false) returns void
language sql security invoker set search_path = '' as $$ select private.record_organizer_email_attempt(target_guest_id, is_resend); $$;
revoke all on function private.record_organizer_email_attempt(uuid, boolean), public.record_organizer_email_attempt(uuid, boolean) from public, anon;
grant execute on function private.record_organizer_email_attempt(uuid, boolean), public.record_organizer_email_attempt(uuid, boolean) to authenticated;

commit;
