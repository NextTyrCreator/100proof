-- What-belongs-here reminders are their own model call, so they are not counted as the repeat check.
alter table public.cost_ledger drop constraint if exists cost_ledger_call_check;
alter table public.cost_ledger
  add constraint cost_ledger_call_check
  check (call in ('list', 'price', 'photo', 'narration', 'reconcile', 'glance', 'receipt', 'voice', 'belongs'));
