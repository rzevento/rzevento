-- Day-before reminder for confirmed guests; saved only after Make confirms the message.
alter table public.invitations
  add column if not exists event_reminder_sent_at timestamptz;

grant update (event_reminder_sent_at) on table public.invitations to service_role;
