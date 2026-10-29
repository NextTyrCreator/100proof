-- Saved inventories, the evidence log behind each line, the model cost ledger, and private media.
-- Device coordinates are not stored. An inventory keeps the time of the reading and whether it was within a mile.

create table public.inventories (
  id uuid primary key,
  org_id uuid not null references public.organizations (id),
  created_by uuid not null default auth.uid() references auth.users (id),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  region text not null check (region in ('us', 'ca', 'uk', 'eu')),
  address text not null check (char_length(address) between 1 and 300),
  document jsonb not null check (jsonb_typeof(document) = 'object' and octet_length(document::text) <= 2000000),
  schema_version smallint not null default 1 check (schema_version = 1),
  version integer not null default 1 check (version >= 1),
  record_hash text check (record_hash ~ '^[a-f0-9]{64}$'),
  sealed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);

create table public.item_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  inventory_id uuid not null,
  item_id uuid not null,
  kind text not null check (kind in ('seen', 'said', 'photo', 'clip', 'answer', 'edit', 'priced', 'added', 'removed')),
  evidence jsonb not null default '{}'::jsonb check (octet_length(evidence::text) <= 8000),
  before jsonb check (before is null or octet_length(before::text) <= 8000),
  after jsonb check (after is null or octet_length(after::text) <= 8000),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (inventory_id, org_id) references public.inventories (id, org_id) on delete cascade
);

create table public.cost_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  user_id uuid not null default auth.uid() references auth.users (id),
  inventory_id uuid,
  call text not null check (call in ('list', 'price', 'photo', 'narration')),
  model text not null check (char_length(model) between 1 and 60),
  ok boolean not null,
  latency_ms integer not null check (latency_ms >= 0),
  bytes_in bigint not null default 0 check (bytes_in >= 0),
  audio_ms integer check (audio_ms is null or audio_ms >= 0),
  created_at timestamptz not null default now()
);

create index inventories_org_created_idx on public.inventories (org_id, created_at desc, id desc);
create index item_events_item_idx on public.item_events (inventory_id, item_id, created_at);
create index cost_ledger_org_created_idx on public.cost_ledger (org_id, created_at desc);

alter table public.inventories enable row level security;
alter table public.inventories force row level security;
alter table public.item_events enable row level security;
alter table public.item_events force row level security;
alter table public.cost_ledger enable row level security;
alter table public.cost_ledger force row level security;

create policy inventories_select_member on public.inventories
  for select to authenticated using (public.is_org_member(org_id));
create policy inventories_insert_member on public.inventories
  for insert to authenticated with check (public.is_org_member(org_id) and created_by = auth.uid());
create policy inventories_update_member on public.inventories
  for update to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy inventories_delete_member on public.inventories
  for delete to authenticated using (public.is_org_member(org_id));

-- The evidence log is append-only: no update or delete policy.
create policy item_events_select_member on public.item_events
  for select to authenticated using (public.is_org_member(org_id));
create policy item_events_insert_member on public.item_events
  for insert to authenticated with check (public.is_org_member(org_id) and created_by = auth.uid());

create policy cost_ledger_select_member on public.cost_ledger
  for select to authenticated using (public.is_org_member(org_id));
create policy cost_ledger_insert_member on public.cost_ledger
  for insert to authenticated with check (public.is_org_member(org_id) and user_id = auth.uid());

-- Each person gets one personal organization the first time they save.
create or replace function public.ensure_personal_org()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  found uuid;
begin
  if me is null then
    raise exception 'sign in required';
  end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  select org_id into found
  from public.org_members
  where user_id = me and role = 'owner'
  order by created_at
  limit 1;
  if found is not null then
    return found;
  end if;
  found := gen_random_uuid();
  insert into public.organizations (id, name) values (found, 'Personal');
  insert into public.org_members (org_id, user_id, role) values (found, me, 'owner');
  return found;
end;
$$;

revoke all on function public.ensure_personal_org() from public;
grant execute on function public.ensure_personal_org() to authenticated;

-- Media lives under <org_id>/<inventory_id>/ in a private bucket.
create or replace function public.path_org(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(object_name, '/', 1)::uuid
    else null
  end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence',
  'evidence',
  false,
  33554432,
  array['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'audio/wav']
);

create policy evidence_select_member on storage.objects
  for select to authenticated
  using (bucket_id = 'evidence' and public.is_org_member(public.path_org(name)));
create policy evidence_insert_member on storage.objects
  for insert to authenticated
  with check (bucket_id = 'evidence' and public.is_org_member(public.path_org(name)));
create policy evidence_delete_member on storage.objects
  for delete to authenticated
  using (bucket_id = 'evidence' and public.is_org_member(public.path_org(name)));
