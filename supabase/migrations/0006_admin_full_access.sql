update public.event_members set role = 'admin' where role = 'organizer';

alter table public.event_members drop constraint if exists event_members_role_check;
alter table public.event_members add constraint event_members_role_check
  check (role in ('admin', 'staff', 'viewer'));

create or replace function public.add_event_member(
  target_event_id uuid,
  member_email text,
  member_display_name text,
  member_role text
)
returns json language plpgsql security definer set search_path = public, auth as $$
declare
  caller_role text;
  member_user_id uuid;
  member_row public.event_members;
begin
  select role into caller_role from public.event_members
  where event_id = target_event_id and user_id = (select auth.uid());
  if caller_role <> 'admin' then raise exception 'Only admins can manage event members'; end if;
  if member_role not in ('admin', 'staff', 'viewer') then raise exception 'Invalid member role'; end if;
  select id into member_user_id from auth.users where lower(email) = lower(trim(member_email));
  if member_user_id is null then raise exception 'Auth user not found'; end if;
  insert into public.event_members (event_id, user_id, email, display_name, role)
  values (target_event_id, member_user_id, lower(trim(member_email)), nullif(trim(member_display_name), ''), member_role)
  on conflict (event_id, user_id) do update set email = excluded.email, display_name = excluded.display_name, role = excluded.role
  returning * into member_row;
  return json_build_object('event_id', member_row.event_id, 'user_id', member_row.user_id, 'email', member_row.email, 'display_name', member_row.display_name, 'role', member_row.role);
end;
$$;

revoke all on function public.add_event_member(uuid, text, text, text) from public;
grant execute on function public.add_event_member(uuid, text, text, text) to authenticated;
