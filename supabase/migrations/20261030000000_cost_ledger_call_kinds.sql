-- Pricing, reconcile, the live glance, voice notes, and connected receipts are their own model calls now.
alter table public.cost_ledger drop constraint if exists cost_ledger_call_check;
alter table public.cost_ledger
  add constraint cost_ledger_call_check
  check (call in ('list', 'price', 'photo', 'narration', 'reconcile', 'glance', 'receipt', 'voice'));
