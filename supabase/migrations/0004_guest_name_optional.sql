-- The organizer can create an invitation with only the invited person's contact.
alter table public.guests alter column full_name drop not null;
