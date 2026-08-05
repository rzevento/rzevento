create extension if not exists pgcrypto;

create type public.invitation_status as enum ('pending', 'sent', 'bounced');
create type public.rsvp_status as enum ('pending', 'confirmed', 'declined', 'cancelled');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  eyebrow text not null default 'Conferencia privada',
  accent text,
  event_date date not null,
  event_time text not null,
  venue text not null,
  city text not null,
  speaker_name text,
  moderator_name text,
  registration_deadline date,
  created_at timestamptz not null default now()
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  origin text,
  company text,
  created_at timestamptz not null default now(),
  unique (event_id, email)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(12), 'hex'),
  status public.invitation_status not null default 'pending',
  sent_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, guest_id)
);

create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  status public.rsvp_status not null default 'pending',
  submitted_name text,
  submitted_email text,
  submitted_phone text,
  submitted_origin text,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (event_id, guest_id)
);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid references auth.users(id),
  companions integer not null default 0 check (companions >= 0),
  notes text,
  unique (event_id, guest_id)
);

create table public.event_members (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.activity_log (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index guests_event_id_idx on public.guests(event_id);
create index guests_email_idx on public.guests(lower(email));
create index invitations_token_idx on public.invitations(token);
create index activity_log_event_id_idx on public.activity_log(event_id, created_at desc);

alter table public.events enable row level security;
alter table public.guests enable row level security;
alter table public.invitations enable row level security;
alter table public.rsvps enable row level security;
alter table public.check_ins enable row level security;
alter table public.event_members enable row level security;
alter table public.activity_log enable row level security;

create or replace function public.is_event_member(target_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.event_members
    where event_id = target_event_id and user_id = (select auth.uid())
  );
$$;

create policy "members can view events" on public.events for select to authenticated using (public.is_event_member(id));
create policy "members can manage guests" on public.guests for all to authenticated using (public.is_event_member(event_id)) with check (public.is_event_member(event_id));
create policy "members can manage invitations" on public.invitations for all to authenticated using (public.is_event_member(event_id)) with check (public.is_event_member(event_id));
create policy "members can manage rsvps" on public.rsvps for all to authenticated using (public.is_event_member(event_id)) with check (public.is_event_member(event_id));
create policy "members can manage check ins" on public.check_ins for all to authenticated using (public.is_event_member(event_id)) with check (public.is_event_member(event_id));
create policy "members can view membership" on public.event_members for select to authenticated using (user_id = (select auth.uid()));
create policy "members can view activity" on public.activity_log for select to authenticated using (public.is_event_member(event_id));

create or replace function public.submit_rsvp(
  invitation_token text,
  guest_name text,
  guest_email text,
  guest_phone text,
  guest_origin text
)
returns json language plpgsql security definer set search_path = public as $$
declare
  invitation_row public.invitations;
  rsvp_row public.rsvps;
begin
  select * into invitation_row from public.invitations where token = invitation_token;
  if invitation_row.id is null then raise exception 'Invitation not found'; end if;

  update public.guests set full_name = guest_name, email = guest_email, phone = guest_phone, origin = guest_origin
  where id = invitation_row.guest_id;

  insert into public.rsvps (event_id, guest_id, status, submitted_name, submitted_email, submitted_phone, submitted_origin, submitted_at)
  values (invitation_row.event_id, invitation_row.guest_id, 'confirmed', guest_name, guest_email, guest_phone, guest_origin, now())
  on conflict (event_id, guest_id) do update set status = 'confirmed', submitted_name = excluded.submitted_name, submitted_email = excluded.submitted_email, submitted_phone = excluded.submitted_phone, submitted_origin = excluded.submitted_origin, submitted_at = now(), updated_at = now()
  returning * into rsvp_row;

  update public.invitations set opened_at = coalesce(opened_at, now()) where id = invitation_row.id;
  insert into public.activity_log(event_id, guest_id, action, metadata) values (invitation_row.event_id, invitation_row.guest_id, 'rsvp_confirmed', jsonb_build_object('source', 'public_form'));
  return json_build_object('event_id', rsvp_row.event_id, 'guest_id', rsvp_row.guest_id, 'status', rsvp_row.status);
end;
$$;

revoke all on function public.submit_rsvp(text, text, text, text, text) from public;
grant execute on function public.submit_rsvp(text, text, text, text, text) to anon, authenticated;

create or replace function public.cancel_rsvp(invitation_token text)
returns json language plpgsql security definer set search_path = public as $$
declare
  invitation_row public.invitations;
  updated_rsvp public.rsvps;
begin
  select * into invitation_row from public.invitations where token = invitation_token;
  if invitation_row.id is null then raise exception 'Invitation not found'; end if;
  update public.rsvps set status = 'cancelled', updated_at = now()
  where event_id = invitation_row.event_id and guest_id = invitation_row.guest_id
  returning * into updated_rsvp;
  if updated_rsvp.id is null then raise exception 'RSVP not found'; end if;
  insert into public.activity_log(event_id, guest_id, action, metadata) values (invitation_row.event_id, invitation_row.guest_id, 'rsvp_cancelled', jsonb_build_object('source', 'public_form'));
  return json_build_object('event_id', updated_rsvp.event_id, 'guest_id', updated_rsvp.guest_id, 'status', updated_rsvp.status);
end;
$$;

revoke all on function public.cancel_rsvp(text) from public;
grant execute on function public.cancel_rsvp(text) to anon, authenticated;
