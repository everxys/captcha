-- Verification codes table for Supabase (Postgres)
-- Notes:
-- - Timestamps are stored as milliseconds since epoch (BIGINT) to match existing app logic.
-- - Make `code` the primary key to enforce uniqueness.

create table if not exists public.verification_codes (
  code text primary key,
  status text not null check (status in ('unused', 'used', 'expired')),
  used_at bigint null,
  device_id text null,
  expires_at bigint not null
);

create index if not exists verification_codes_status_idx on public.verification_codes (status);
create index if not exists verification_codes_expires_at_idx on public.verification_codes (expires_at);

