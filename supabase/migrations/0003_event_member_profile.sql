-- Store the organizer identity that is shown in the admin panel.
alter table public.event_members
  add column if not exists display_name text,
  add column if not exists role text not null default 'organizer';

alter table public.event_members
  drop constraint if exists event_members_role_check;

alter table public.event_members
  add constraint event_members_role_check
  check (role in ('organizer', 'admin', 'staff', 'viewer'));
