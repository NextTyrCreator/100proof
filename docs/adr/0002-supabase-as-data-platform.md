# ADR 0002: Supabase as the data platform

Date: 2026-10-26 · Status: Accepted · Approved-by: Steven Blackburn

## Context
We need Postgres with pgvector, private object storage for sealed video, and auth with Google OAuth (also the Gmail/Drive consent path). Three vendors cost setup time in a 10-day build and complicate the security story.

## Decision
Supabase for Postgres (`vector` extension, PITR), Storage (private buckets, signed URLs, deny-update policy on `videos/`), and Auth (magic link + Google, PKCE). Row Level Security forced on every table, keyed by `auth.uid()` through `org_members`; the service-role key lives only in the worker. Drizzle owns the schema; migrations run in CI against a Supabase branch. Multi-tenant (`org_id`) from the first migration so commercial accounts need no re-platforming.

## Consequences
One dashboard, one credential set, RLS as the default boundary. Object lock is approximated by bucket policy; true immutability and RFC 3161 timestamps are post-hackathon. Storage egress for video is watched; R2 can sit behind the same `StorageProvider` interface if needed.
