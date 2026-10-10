-- Administrators may change another member's role without changing their profile.
-- The access form creates members only; role changes use the audited function below.
create or replace function public.add_event_member(
  target_event_id uuid,
  member_email text,
  member_display_name text,
  member_role text
)
returns json language plpgsql security definer set search_path = '' as $$
declare caller_role text; member_user_id uuid; member_row public.event_members;
begin
  select role into caller_role from public.event_members
    where event_id = target_event_id and user_id = private.organizer_effective_uid(target_event_id);
  if caller_role is distinct from 'admin' then raise exception 'Only admins can manage event members' using errcode = '42501'; end if;
  if member_role is null or member_role not in ('admin', 'leader', 'staff', 'viewer') then raise exception 'Invalid member role'; end if;
  select id into member_user_id from auth.users where lower(email) = lower(trim(member_email));
  if member_user_id is null then raise exception 'Auth user not found'; end if;
  if exists (select 1 from public.event_members where event_id = target_event_id and user_id = member_user_id) then
    raise exception 'Event member already exists' using errcode = '23505';
  end if;
  insert into public.event_members (event_id, user_id, email, display_name, role)
    values (target_event_id, member_user_id, lower(trim(member_email)), nullif(trim(member_display_name), ''), member_role)
    returning * into member_row;
  return row_to_json(member_row);
end;
$$;

create or replace function private.update_event_member_role(
  target_event_id uuid,
  target_user_id uuid,
  new_role text
)
returns json language plpgsql security definer set search_path = '' as $$
declare
  effective_user_id uuid;
  previous_role text;
  member_row public.event_members;
begin
  effective_user_id := private.organizer_effective_uid(target_event_id);
  if effective_user_id is null or not exists (
    select 1 from public.event_members
    where event_id = target_event_id and user_id = effective_user_id and role = 'admin'
  ) then
    raise exception 'Only admins can change event roles' using errcode = '42501';
  end if;
  if target_user_id = effective_user_id then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;
  if new_role is null or new_role not in ('admin', 'leader', 'staff', 'viewer') then
    raise exception 'Invalid member role' using errcode = '22023';
  end if;

  -- Serialize role changes for this event so the last admin cannot be removed.
  perform 1 from public.events where id = target_event_id for update;
  select role into previous_role from public.event_members
    where event_id = target_event_id and user_id = target_user_id for update;
  if previous_role is null then
    raise exception 'Event member not found' using errcode = 'P0002';
  end if;
  if previous_role = new_role then
    select * into member_row from public.event_members
      where event_id = target_event_id and user_id = target_user_id;
    return row_to_json(member_row);
  end if;
  if previous_role = 'admin' and (
    select count(*) from public.event_members where event_id = target_event_id and role = 'admin'
  ) <= 1 then
    raise exception 'The event must keep an administrator' using errcode = '23514';
  end if;

  update public.event_members set role = new_role
    where event_id = target_event_id and user_id = target_user_id
    returning * into member_row;
  insert into public.activity_log(event_id, action, actor_id, metadata)
    values (target_event_id, 'event_member_role_changed', auth.uid(), jsonb_build_object(
      'member_user_id', target_user_id, 'previous_role', previous_role,
      'new_role', new_role, 'effective_user_id', effective_user_id));
  return row_to_json(member_row);
end;
$$;

revoke all on function private.update_event_member_role(uuid, uuid, text) from public, anon;
grant execute on function private.update_event_member_role(uuid, uuid, text) to authenticated;

create or replace function public.update_event_member_role(
  target_event_id uuid,
  target_user_id uuid,
  new_role text
)
returns json language sql security invoker set search_path = '' as $$
  select private.update_event_member_role(target_event_id, target_user_id, new_role);
$$;
revoke all on function public.update_event_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.update_event_member_role(uuid, uuid, text) to authenticated;
