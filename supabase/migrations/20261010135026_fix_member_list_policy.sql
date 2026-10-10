-- Use the caller's own identity in RLS; the private helper remains uncallable directly.
drop policy if exists "members can view authorized membership" on public.event_members;
create policy "members can view authorized membership" on public.event_members for select to authenticated
  using (public.is_event_member(event_id) and (
    private.event_member_role(event_id) = 'admin' or user_id = (select auth.uid())
  ));
