-- The Edge Function saves delivery only after Make confirms the message.
alter table public.invitations
  add column if not exists reminder_sent_at timestamptz;

grant select on table public.invitations to service_role;
grant update (status, sent_at, reminder_sent_at) on table public.invitations to service_role;
