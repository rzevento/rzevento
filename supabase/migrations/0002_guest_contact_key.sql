-- A guest is identified by either email or phone; both are optional individually.
alter table public.guests alter column email drop not null;
alter table public.guests drop constraint if exists guests_event_id_email_key;

alter table public.guests
  add constraint guests_contact_key_required
  check (nullif(trim(email), '') is not null or nullif(trim(phone), '') is not null);

create unique index guests_event_email_key
  on public.guests (event_id, lower(trim(email)))
  where nullif(trim(email), '') is not null;

create unique index guests_event_phone_key
  on public.guests (event_id, regexp_replace(phone, '\D', '', 'g'))
  where nullif(trim(phone), '') is not null;

drop index if exists public.guests_email_idx;
create index guests_email_idx on public.guests(lower(trim(email))) where nullif(trim(email), '') is not null;
create index guests_phone_idx on public.guests(regexp_replace(phone, '\D', '', 'g')) where nullif(trim(phone), '') is not null;
