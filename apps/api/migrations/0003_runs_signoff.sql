-- Runs (the audit trail), scenario variants, the sign-off queue and model status (spec sections 1.2, 1.3, 2).

create table if not exists runs (
  id text primary key,
  created_at timestamptz not null,
  requested_by text not null,
  place text not null,
  hazard text not null,
  status text not null check (status in ('planned', 'running', 'ok', 'failed')),
  stale boolean not null default false,
  chain_signed_off boolean not null default false,
  duration_ms integer not null default 0,
  -- the whole RunRecord (plan, contracts, registry versions, steps, hand-offs, log, result)
  record jsonb not null
);
create index if not exists runs_place_idx on runs (place, created_at desc);

create table if not exists scenario_variants (
  id text primary key,
  created_at timestamptz not null,
  requested_by text not null,
  reason text not null,
  record jsonb not null
);

create table if not exists signoff_items (
  id text primary key,
  kind text not null check (kind in ('policy_finding', 'registry_edit', 'calibration_claim', 'chain_sign_off')),
  title text not null,
  reasoning text not null,
  payload jsonb not null,
  proposed_by text not null,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null,
  decided_by text,
  decided_at timestamptz,
  decision_note text
);
create index if not exists signoff_status_idx on signoff_items (status, created_at desc);

-- calibration status per model, set from the admin side; the contract in code carries the default
create table if not exists model_status (
  model_id text primary key,
  calibration_status text not null check (calibration_status in ('uncalibrated', 'calibrated', 'signed_off')),
  events jsonb not null default '[]'::jsonb,
  signed_off_by text,
  signed_off_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text
);
