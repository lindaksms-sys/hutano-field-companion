create table public.encounter_revisions (
 id uuid primary key,
 owner_id uuid not null references auth.users(id),
 encounter_id uuid not null,
 device_id uuid not null,
 local_revision integer not null check (local_revision > 0),
 schema_version integer not null default 1 check (schema_version = 1),
 language text not null check (language in ('sn','en','mixed')),
 raw_narrative text not null check (length(raw_narrative) between 1 and 50000),
 fields jsonb not null check (jsonb_typeof(fields) = 'object'),
 review_status text not null check (review_status = 'verified'),
 verified_at timestamptz not null,
 client_updated_at timestamptz not null,
 received_at timestamptz not null default now(),
 is_synthetic boolean not null default true check (is_synthetic = true),
 unique(owner_id, encounter_id, device_id, local_revision)
);
create index encounter_revisions_owner_received on public.encounter_revisions(owner_id, received_at);
alter table public.encounter_revisions enable row level security;
revoke all on public.encounter_revisions from anon, authenticated;
grant select, insert on public.encounter_revisions to authenticated;
create policy read_own_revisions on public.encounter_revisions for select to authenticated using ((select auth.uid()) = owner_id);
create policy insert_own_verified_revisions on public.encounter_revisions for insert to authenticated with check ((select auth.uid()) = owner_id and review_status = 'verified' and is_synthetic = true);
comment on table public.encounter_revisions is 'Hutano hackathon synthetic-only immutable verified snapshots. No clinical decisions. Concurrent device revisions are retained, never silently overwritten.';
