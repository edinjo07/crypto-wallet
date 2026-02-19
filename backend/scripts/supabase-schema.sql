-- ============================================================
-- Supabase Schema — crypto-wallet-platform
-- ============================================================
-- Run this in: Supabase Dashboard → SQL Editor
-- These tables complement (and do NOT replace) the existing MongoDB models.
-- MongoDB remains the primary operational store; Supabase is used for:
--   • KYC document storage (Supabase Storage bucket)
--   • Security audit log (queryable via SQL / Supabase Studio)
--   • Lightweight user profile sync for analytics
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";


-- ─────────────────────────────────────────────
-- 1. KYC Submissions
--    Tracks KYC review state + Storage references.
--    Populated by POST /api/wallet/kyc-submit on the backend.
-- ─────────────────────────────────────────────
create table if not exists public.kyc_submissions (
  id              uuid        primary key default uuid_generate_v4(),
  mongo_user_id   text        not null,              -- MongoDB User._id (string)
  full_name       text        not null,
  document_type   text        not null,              -- 'passport' | 'driving_license' | 'national_id'
  document_number text,
  document_hash   text,                              -- SHA-256 hash of document content
  storage_path    text,                              -- Supabase Storage path: 'kyc-documents/<userId>/<filename>'
  public_url      text,                              -- Signed / public URL from Supabase Storage
  status          text        not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  reviewer_notes  text,
  submitted_at    timestamptz not null default now(),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Index for fast lookups by MongoDB user ID
create index if not exists kyc_submissions_mongo_user_id_idx
  on public.kyc_submissions (mongo_user_id);

-- Row Level Security (RLS) — disable for service-role writes from the backend;
-- enable the policy below if you ever expose this table via the anon key.
alter table public.kyc_submissions enable row level security;

-- Allow backend (service role) full access — service role bypasses RLS automatically.
-- Add user-facing policies here if you build a Supabase-authenticated frontend flow.


-- ─────────────────────────────────────────────
-- 2. Audit Events
--    Security audit log for all critical actions.
--    More queryable than MongoDB for compliance reporting.
-- ─────────────────────────────────────────────
create table if not exists public.audit_events (
  id            uuid        primary key default uuid_generate_v4(),
  mongo_user_id text,                          -- null for unauthenticated events
  action        text        not null,          -- e.g. 'login', 'kyc_submit', 'wallet_create'
  resource      text,                          -- e.g. 'wallet', 'user', 'transaction'
  resource_id   text,                          -- MongoDB resource ID
  ip_address    text,
  user_agent    text,
  success       boolean     not null default true,
  metadata      jsonb,                         -- arbitrary extra fields
  created_at    timestamptz not null default now()
);

create index if not exists audit_events_mongo_user_id_idx
  on public.audit_events (mongo_user_id);

create index if not exists audit_events_action_idx
  on public.audit_events (action);

create index if not exists audit_events_created_at_idx
  on public.audit_events (created_at desc);

alter table public.audit_events enable row level security;


-- ─────────────────────────────────────────────
-- 3. User Profiles (lightweight sync)
--    Minimal projection of MongoDB User records.
--    Updated whenever a user logs in or their profile changes.
-- ─────────────────────────────────────────────
create table if not exists public.user_profiles (
  id              uuid        primary key default uuid_generate_v4(),
  mongo_user_id   text        not null unique,
  email           text        not null,
  name            text,
  kyc_status      text        not null default 'NO_KYC', -- mirrors User.kycStatus
  is_admin        boolean     not null default false,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);

create unique index if not exists user_profiles_mongo_user_id_key
  on public.user_profiles (mongo_user_id);

alter table public.user_profiles enable row level security;


-- ─────────────────────────────────────────────
-- 4. Wallet Snapshots (optional analytics)
--    Periodic balance snapshots for charting / reporting.
--    Written by the balance refresher job.
-- ─────────────────────────────────────────────
create table if not exists public.wallet_snapshots (
  id              uuid        primary key default uuid_generate_v4(),
  mongo_user_id   text        not null,
  mongo_wallet_id text        not null,
  currency        text        not null,          -- 'BTC' | 'ETH' | 'USDT' …
  balance_native  numeric(30, 18),               -- balance in native units
  balance_usd     numeric(20, 2),                -- USD equivalent at snapshot time
  usd_price       numeric(20, 8),                -- price used for conversion
  snapshot_at     timestamptz not null default now()
);

create index if not exists wallet_snapshots_user_idx
  on public.wallet_snapshots (mongo_user_id, snapshot_at desc);

alter table public.wallet_snapshots enable row level security;


-- ─────────────────────────────────────────────
-- 5. Supabase Storage bucket (run separately or via Dashboard)
-- ─────────────────────────────────────────────
-- Create the bucket from the backend or Dashboard — SQL bucket creation
-- requires the storage schema which may need elevated permissions.
-- Equivalent JS (run once during setup):
--
--   const supabase = getSupabaseAdmin();
--   await supabase.storage.createBucket('kyc-documents', {
--     public: false,
--     fileSizeLimit: 10 * 1024 * 1024,  // 10 MB
--     allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf']
--   });
--
-- OR via Dashboard: Storage → New Bucket → name: kyc-documents, Private


-- ─────────────────────────────────────────────
-- Helper: auto-update updated_at on kyc_submissions
-- ─────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kyc_submissions_updated_at on public.kyc_submissions;
create trigger kyc_submissions_updated_at
  before update on public.kyc_submissions
  for each row execute function public.set_updated_at();
