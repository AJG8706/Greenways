-- Vendor API keys, rotatable from the admin Settings page without a
-- deploy. Values are AES-256-GCM ciphertext produced in the app layer
-- with KEY_ENCRYPTION_KEY (lives only in the deployment's env, never in
-- this database) — so the nightly dumps only ever carry ciphertext.
-- RLS with zero policies + revoked grants: service-role access only,
-- same posture as the audit hardening.
create table public.service_keys (
  name text primary key,
  ciphertext text not null,
  last4 text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.service_keys enable row level security;
revoke all on table public.service_keys from public, anon, authenticated;
