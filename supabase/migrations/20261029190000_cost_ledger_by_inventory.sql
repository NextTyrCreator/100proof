-- The measures panel reads one inventory's model calls.
create index if not exists cost_ledger_inventory_idx on public.cost_ledger (inventory_id, created_at);
