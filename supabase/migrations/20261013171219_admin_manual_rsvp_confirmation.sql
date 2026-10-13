-- Manual changes to responses belong to event administrators. The public
-- invitation-token functions retain their existing guest-facing flow.
drop policy if exists "non-leaders can change rsvps" on public.rsvps;

create policy "admins can insert rsvps" on public.rsvps for insert to authenticated
  with check (public.is_event_member(event_id) and private.event_member_role(event_id) = 'admin');
create policy "admins can update rsvps" on public.rsvps for update to authenticated
  using (public.is_event_member(event_id) and private.event_member_role(event_id) = 'admin')
  with check (public.is_event_member(event_id) and private.event_member_role(event_id) = 'admin');
create policy "admins can delete rsvps" on public.rsvps for delete to authenticated
  using (public.is_event_member(event_id) and private.event_member_role(event_id) = 'admin');
