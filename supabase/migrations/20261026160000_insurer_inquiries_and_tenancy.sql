-- Tenancy root, insurer reach-outs, and the de-identified recognition counters.
-- organizations is the tenant. It has no parent org_id.
-- Applied to 100proof-dev (rsuoqojbhbisiymogaqy) on 2026-10-26.

create table public.organizations (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.organizations (id),
  user_id uuid not null references auth.users (id),
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table public.insurer_inquiries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  company_name text not null,
  contact_name text not null,
  email text not null,
  market text not null check (market in ('personal', 'commercial', 'both')),
  note text,
  created_at timestamptz not null default now()
);

create table public.recognition_memory (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  category_shard smallint not null check (category_shard between 0 and 7),
  object_key text not null check (object_key ~ '^[a-z0-9-]{2,64}$'),
  confidence_band text not null check (confidence_band in ('certain', 'review')),
  confirmed_count integer not null default 0 check (confirmed_count >= 0),
  corrected_count integer not null default 0 check (corrected_count >= 0),
  updated_at timestamptz not null default now(),
  unique (org_id, object_key, confidence_band)
);

create index insurer_inquiries_org_created_idx
  on public.insurer_inquiries (org_id, created_at desc);

create index recognition_memory_shard_idx
  on public.recognition_memory (org_id, category_shard, object_key);

create index org_members_user_idx
  on public.org_members (user_id);

alter table public.organizations enable row level security;
alter table public.organizations force row level security;
alter table public.org_members enable row level security;
alter table public.org_members force row level security;
alter table public.insurer_inquiries enable row level security;
alter table public.insurer_inquiries force row level security;
alter table public.recognition_memory enable row level security;
alter table public.recognition_memory force row level security;

create or replace function public.is_org_member(check_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members
    where org_id = check_org
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;

create policy organizations_select_member
  on public.organizations
  for select
  to authenticated
  using (public.is_org_member(id));

create policy org_members_select_self
  on public.org_members
  for select
  to authenticated
  using (user_id = auth.uid());

create policy insurer_inquiries_select_member
  on public.insurer_inquiries
  for select
  to authenticated
  using (public.is_org_member(org_id));

create policy recognition_memory_select_member
  on public.recognition_memory
  for select
  to authenticated
  using (public.is_org_member(org_id));

create or replace function public.submit_insurer_inquiry(
  company_name text,
  contact_name text,
  email text,
  market text,
  note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  clean_email text;
  operator uuid := '00000000-0000-4000-8000-000000000001';
begin
  clean_email := lower(btrim(email));
  if company_name is null or char_length(btrim(company_name)) < 2 or char_length(company_name) > 120 then
    raise exception 'company name is required';
  end if;
  if contact_name is null or char_length(btrim(contact_name)) < 2 or char_length(contact_name) > 120 then
    raise exception 'contact name is required';
  end if;
  if clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(clean_email) > 200 then
    raise exception 'email is required';
  end if;
  if market not in ('personal', 'commercial', 'both') then
    raise exception 'market is required';
  end if;
  if note is not null and char_length(note) > 1000 then
    raise exception 'note is too long';
  end if;

  insert into public.insurer_inquiries (org_id, company_name, contact_name, email, market, note)
  values (
    operator,
    btrim(company_name),
    btrim(contact_name),
    clean_email,
    market,
    nullif(btrim(coalesce(note, '')), '')
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.submit_insurer_inquiry(text, text, text, text, text) from public;
grant execute on function public.submit_insurer_inquiry(text, text, text, text, text) to anon, authenticated;

insert into public.organizations (id, name)
values ('00000000-0000-4000-8000-000000000001', '100proof');
