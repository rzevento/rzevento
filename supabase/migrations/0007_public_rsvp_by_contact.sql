create or replace function public.begin_rsvp(guest_contact text)
returns json language plpgsql security definer set search_path = public as $$
declare
  invitation_id uuid;
  invitation_event_id uuid;
  invitation_guest_id uuid;
  invitation_token text;
  current_status public.rsvp_status;
begin
  select i.id, i.event_id, i.guest_id, i.token
  into invitation_id, invitation_event_id, invitation_guest_id, invitation_token
  from public.invitations i join public.guests g on g.id = i.guest_id
  where lower(trim(coalesce(g.email, ''))) = lower(trim(guest_contact))
     or regexp_replace(coalesce(g.phone, ''), '\D', '', 'g') = regexp_replace(guest_contact, '\D', '', 'g')
  order by i.created_at desc limit 1;
  if invitation_id is null then raise exception 'Guest not found'; end if;
  select status into current_status from public.rsvps where event_id = invitation_event_id and guest_id = invitation_guest_id;
  return json_build_object('token', invitation_token, 'status', case when current_status = 'confirmed' then 'already_registered' else 'pending' end);
end;
$$;

revoke all on function public.begin_rsvp(text) from public;
grant execute on function public.begin_rsvp(text) to anon, authenticated;
