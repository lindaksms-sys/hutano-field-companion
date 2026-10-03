# Backend schema (external Supabase)

Project: `cqggulderafbyvzjvobr` — https://supabase.com/dashboard/project/cqggulderafbyvzjvobr

`0001_encounter_revisions.sql` is an exact copy of the migration that was **already applied** to the
project. It is documentation only. Do not re-run it. It is deliberately outside `supabase/migrations/`
so no tooling applies it automatically.

Key constraints: synthetic-only (`is_synthetic = true` check), verified-only, RLS owner-scoped,
`authenticated` has `select, insert` only — no update/delete/upsert. Snapshots are immutable and
append-only; concurrent device revisions are all retained.
