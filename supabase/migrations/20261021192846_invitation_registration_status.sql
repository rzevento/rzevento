create or replace function public.get_invitation_details(invitation_token text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'name', g.full_name, 'email', g.email, 'phone', g.phone,
    'company', coalesce(nullif(trim(g.company), ''), nullif(trim(r.submitted_origin), '')),
    'status', coalesce(r.status::text, 'pending')
  )
  from public.invitations i
  join public.guests g on g.id = i.guest_id and g.event_id = i.event_id
  left join public.rsvps r on r.guest_id = i.guest_id and r.event_id = i.event_id
  where i.token = invitation_token and nullif(trim(invitation_token), '') is not null;
$$;
revoke all on function public.get_invitation_details(text) from public;
grant execute on function public.get_invitation_details(text) to anon, authenticated;

