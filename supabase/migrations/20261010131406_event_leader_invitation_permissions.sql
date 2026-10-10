-- Líder can send existing invitations but cannot change guests, RSVPs, members or event settings.
begin;

alter table public.event_members drop constraint if exists event_members_role_check;
alter table public.event_members add constraint event_members_role_check
  check (role in ('admin', 'leader', 'staff', 'viewer'));

create or replace function private.event_member_role(target_event_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select role from public.event_members
  where event_id = target_event_id and user_id = private.organizer_effective_uid(target_event_id);
$$;
revoke all on function private.event_member_role(uuid) from public, anon;
grant execute on function private.event_member_role(uuid) to authenticated;

create or replace function private.organizer_context(target_event_id uuid default null) returns jsonb
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
    'role', case member.role when 'admin' then 'Administrador' when 'leader' then 'Líder' when 'staff' then 'Equipo' when 'viewer' then 'Consulta' else member.role end,
    'impersonationId', s.id, 'expiresAt', s.expires_at
  );
end;
$$;

create or replace function public.add_event_member(target_event_id uuid, member_email text, member_display_name text, member_role text)
returns json language plpgsql security definer set search_path = '' as $$
declare caller_role text; member_user_id uuid; member_row public.event_members;
begin
  select role into caller_role from public.event_members
    where event_id = target_event_id and user_id = private.organizer_effective_uid(target_event_id);
  if caller_role is distinct from 'admin' then raise exception 'Only admins can manage event members' using errcode = '42501'; end if;
  if member_role is null or member_role not in ('admin', 'leader', 'staff', 'viewer') then raise exception 'Invalid member role'; end if;
  select id into member_user_id from auth.users where lower(email) = lower(trim(member_email));
  if member_user_id is null then raise exception 'Auth user not found'; end if;
  insert into public.event_members (event_id, user_id, email, display_name, role)
    values (target_event_id, member_user_id, lower(trim(member_email)), nullif(trim(member_display_name), ''), member_role)
    on conflict (event_id, user_id) do update set email = excluded.email, display_name = excluded.display_name, role = excluded.role
    returning * into member_row;
  return row_to_json(member_row);
end;
$$;

-- Only administrators may list the team; members can read their own role.
drop policy if exists "members can view membership" on public.event_members;
create policy "members can view authorized membership" on public.event_members for select to authenticated
  using (public.is_event_member(event_id) and (private.event_member_role(event_id) = 'admin'
    or user_id = private.organizer_effective_uid(event_id)));

-- Loading guests, individually or through CSV, requires administrator access.
drop policy if exists "members can manage guests" on public.guests;
create policy "members can read guests" on public.guests for select to authenticated using (public.is_event_member(event_id));
create policy "admins can add guests" on public.guests for insert to authenticated
  with check (public.is_event_member(event_id) and private.event_member_role(event_id) = 'admin');
create policy "non-leaders can update guests" on public.guests for update to authenticated
  using (public.is_event_member(event_id) and private.event_member_role(event_id) is distinct from 'leader')
  with check (public.is_event_member(event_id) and private.event_member_role(event_id) is distinct from 'leader');
create policy "non-leaders can delete guests" on public.guests for delete to authenticated
  using (public.is_event_member(event_id) and private.event_member_role(event_id) is distinct from 'leader');

drop policy if exists "members can manage rsvps" on public.rsvps;
create policy "members can read rsvps" on public.rsvps for select to authenticated using (public.is_event_member(event_id));
create policy "non-leaders can change rsvps" on public.rsvps for all to authenticated
  using (public.is_event_member(event_id) and private.event_member_role(event_id) is distinct from 'leader')
  with check (public.is_event_member(event_id) and private.event_member_role(event_id) is distinct from 'leader');

drop policy if exists "members can manage invitations" on public.invitations;
create policy "members can read invitations" on public.invitations for select to authenticated using (public.is_event_member(event_id));
create policy "admins can add invitations" on public.invitations for insert to authenticated
  with check (public.is_event_member(event_id) and private.event_member_role(event_id) = 'admin');
create policy "non-leaders can update invitations" on public.invitations for update to authenticated
  using (public.is_event_member(event_id) and private.event_member_role(event_id) is distinct from 'leader')
  with check (public.is_event_member(event_id) and private.event_member_role(event_id) is distinct from 'leader');
create policy "non-leaders can delete invitations" on public.invitations for delete to authenticated
  using (public.is_event_member(event_id) and private.event_member_role(event_id) is distinct from 'leader');

create or replace function private.mark_whatsapp_invitation_sent(target_guest_id uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare recorded_at timestamptz;
begin
  update public.invitations i
    set whatsapp_sent_at = coalesce(i.whatsapp_sent_at, now())
    where i.guest_id = target_guest_id
      and public.is_event_member(i.event_id)
      and private.event_member_role(i.event_id) in ('admin', 'leader')
    returning i.whatsapp_sent_at into recorded_at;
  if not found then raise exception 'Invitation not found or access denied' using errcode = '42501'; end if;
  return recorded_at;
end;
$$;
revoke all on function private.mark_whatsapp_invitation_sent(uuid) from public, anon;
grant execute on function private.mark_whatsapp_invitation_sent(uuid) to authenticated;

create or replace function public.mark_whatsapp_invitation_sent(target_guest_id uuid)
returns timestamptz language sql security invoker set search_path = '' as $$
  select private.mark_whatsapp_invitation_sent(target_guest_id);
$$;
revoke all on function public.mark_whatsapp_invitation_sent(uuid) from public, anon;
grant execute on function public.mark_whatsapp_invitation_sent(uuid) to authenticated;

create or replace function private.record_organizer_email_attempt(target_guest_id uuid, is_resend boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_event uuid; v_user uuid; v_role text;
begin
  select event_id into v_event from public.guests where id = target_guest_id;
  v_user := private.organizer_effective_uid(v_event);
  select role into v_role from public.event_members where event_id = v_event and user_id = v_user;
  if v_role is null or v_role not in ('admin', 'leader') then
    raise exception 'No tienes permiso para enviar invitaciones' using errcode = '42501';
  end if;
  insert into public.activity_log(event_id, guest_id, action, actor_id, metadata)
    values(v_event, target_guest_id, 'invitation_email_attempt', auth.uid(), jsonb_build_object(
      'subject_id', v_user, 'session_id', private.request_impersonation_id(), 'resend', is_resend));
end;
$$;

commit;
