-- The invitation token is the capability already used by submit_rsvp/cancel_rsvp.
-- Return only form fields for that invitation; never expose the guest list.
create or replace function public.get_invitation_details(invitation_token text)
returns json
language sql stable security definer
set search_path = ''
as $$
  select json_build_object(
    'name', g.full_name,
    'email', g.email,
    'phone', g.phone,
    'company', coalesce(nullif(trim(g.company), ''), nullif(trim(r.submitted_origin), ''))
  )
  from public.invitations i
  join public.guests g on g.id = i.guest_id and g.event_id = i.event_id
  left join public.rsvps r on r.guest_id = i.guest_id and r.event_id = i.event_id
  where i.token = invitation_token and nullif(trim(invitation_token), '') is not null;
$$;

revoke all on function public.get_invitation_details(text) from public;
grant execute on function public.get_invitation_details(text) to anon, authenticated;

-- Preserve the deployed confirmation function and its access controls, changing
-- only the column used by the public form's Empresa field.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.submit_rsvp(text,text,text,text,text)'::regprocedure);
  if position('phone = guest_phone, origin = guest_origin' in definition) > 0 then
    execute replace(definition, 'phone = guest_phone, origin = guest_origin', 'phone = guest_phone, company = guest_origin');
  elsif position('phone = guest_phone, company = guest_origin' in definition) = 0 then
    raise exception 'Unexpected submit_rsvp definition; review before applying';
  end if;
end;
$migration$;
