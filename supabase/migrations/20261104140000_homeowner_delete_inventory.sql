-- A homeowner may delete their own inventory. That removes the line history for that inventory.
-- The cost ledger is not deleted. It has no item content and stays for the learning record.

create policy item_events_delete_member on public.item_events
  for delete to authenticated
  using (public.is_org_member(org_id));
