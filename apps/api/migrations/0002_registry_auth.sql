-- Science registry (spec section 3) and the minimal role gate (spec section 5).

create table if not exists users (
  email text primary key,
  role text not null check (role in ('admin', 'scientist', 'reviewer', 'viewer')),
  display_name text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists auth_tokens (
  token_hash text primary key,
  email text not null references users(email),
  expires_at timestamptz not null,
  used_at timestamptz
);

-- one row per version; never updated except for status, reviewer, review_note, approved_at (the workflow in packages/registry)
create table if not exists registry_entries (
  version_id text primary key,
  id text not null,
  version integer not null,
  kind text not null,
  label text not null,
  value jsonb not null,
  unit text not null default '',
  valid_range jsonb,
  level text not null check (level in ('global', 'national', 'state', 'city', 'site')),
  geography text not null,
  source jsonb not null,
  grounding text not null check (grounding in ('solid_direct', 'reasoned_extrapolation', 'placeholder_needs_calibration')),
  note text,
  author text not null,
  reviewer text,
  review_note text,
  status text not null check (status in ('draft', 'in_review', 'approved', 'superseded')),
  created_at timestamptz not null,
  approved_at timestamptz,
  supersedes text,
  change_reason text,
  used_by text[] not null default '{}',
  unique (id, version)
);
create index if not exists registry_entries_id_idx on registry_entries (id);
create index if not exists registry_entries_status_idx on registry_entries (status);
create index if not exists registry_entries_geo_idx on registry_entries (level, geography);
