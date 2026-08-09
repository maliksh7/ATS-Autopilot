-- ============================================================================
-- ATS Autopilot ; Supabase / PostgreSQL schema
-- Run this in the Supabase SQL Editor before first use.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profile: cached parsed Candidate JSON (one row per profile Google Doc)
-- The Profile Parser writes here; the pipeline reads the cached candidate_json.
-- ----------------------------------------------------------------------------
create table if not exists profile (
  id            bigint generated always as identity primary key,
  doc_id        text unique,           -- the Google Doc ID of the profile
  modified_time timestamptz,           -- (optional) Doc's Drive modifiedTime, for cache invalidation
  candidate_json jsonb,                -- the parsed Candidate JSON (source of truth downstream)
  updated_at    timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- applications: one row per generated application (upserted on job_url)
-- ----------------------------------------------------------------------------
create table if not exists applications (
  id                   bigint generated always as identity primary key,
  job_url              text unique,     -- dedup key (upsert target)
  company              text,
  title                text,
  match_score          int,
  should_apply         boolean,
  missing_skills       jsonb,
  strengths            jsonb,
  recommended_keywords jsonb,
  reason               text,
  doc_link             text,            -- editable Google Doc
  pdf_link             text,            -- exported PDF
  resume_version       text,
  application_json     jsonb,           -- full application package metadata
  generated_at         timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Row-Level Security
-- This is a single-user, server-side automation. n8n authenticates with your
-- Supabase key from a trusted backend, so RLS adds no value here and would
-- otherwise block inserts. Disable it on both tables:
-- ----------------------------------------------------------------------------
alter table profile      disable row level security;
alter table applications disable row level security;

-- If you prefer to KEEP RLS enabled instead, use the service_role key in n8n
-- (it bypasses RLS), or add explicit insert/select policies for your role.

-- ----------------------------------------------------------------------------
-- Notes
-- * The workflow's "Filter Out Duplicates" node queries `applications` by
--   job_url so previously-processed jobs are skipped on later runs.
-- * "Store Application" upserts with header `Prefer: resolution=merge-duplicates`
--   and `?on_conflict=job_url`, so re-runs update rather than error.
-- ----------------------------------------------------------------------------
