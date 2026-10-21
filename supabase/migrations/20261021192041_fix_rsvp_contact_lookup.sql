create or replace function public.begin_rsvp(guest_contact text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  invitation_id uuid;
  invitation_event_id uuid;
  invitation_guest_id uuid;
  invitation_token text;
  current_status public.rsvp_status;
  contact text := nullif(trim(guest_contact), '');
  contact_phone text;
begin
  if contact is null then raise exception 'Guest not found'; end if;
  -- Email addresses must never match guests through empty phone numbers.
  if position('@' in contact) = 0 then
    contact_phone := nullif(regexp_replace(contact, '[^0-9]', '', 'g'), '');
  end if;
  select i.id, i.event_id, i.guest_id, i.token
  into invitation_id, invitation_event_id, invitation_guest_id, invitation_token
  from public.invitations i join public.guests g on g.id = i.guest_id and g.event_id = i.event_id
  where (position('@' in contact) > 0 and lower(trim(g.email)) = lower(contact))
     or (contact_phone is not null and nullif(regexp_replace(g.phone, '[^0-9]', '', 'g'), '') = contact_phone)
  order by i.created_at desc, i.id desc limit 1;
  if invitation_id is null then raise exception 'Guest not found'; end if;
  select status into current_status from public.rsvps where event_id = invitation_event_id and guest_id = invitation_guest_id;
  return json_build_object('token', invitation_token, 'status', case when current_status = 'confirmed' then 'already_registered' else 'pending' end);
end;
$$;
revoke all on function public.begin_rsvp(text) from public;
grant execute on function public.begin_rsvp(text) to anon, authenticated;

