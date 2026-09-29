-- Email keeps using status/sent_at. WhatsApp records an organizer's manual acknowledgement.
alter table public.invitations
  add column whatsapp_sent_at timestamptz;

comment on column public.invitations.whatsapp_sent_at is
  'Server time when an organizer marked WhatsApp as sent; not a delivery/read receipt.';

create or replace function public.mark_whatsapp_invitation_sent(target_guest_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  recorded_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Existing invitation RLS limits the operation to the caller's events.
  -- COALESCE preserves the first timestamp on retries or concurrent clicks.
  update public.invitations
  set whatsapp_sent_at = coalesce(whatsapp_sent_at, now())
  where guest_id = target_guest_id
  returning whatsapp_sent_at into recorded_at;

  if not found then
    raise exception 'Invitation not found or access denied' using errcode = '42501';
  end if;
  return recorded_at;
end;
$$;

revoke all on function public.mark_whatsapp_invitation_sent(uuid) from public, anon;
grant execute on function public.mark_whatsapp_invitation_sent(uuid) to authenticated;
