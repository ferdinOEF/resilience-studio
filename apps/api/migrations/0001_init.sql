-- Resilience Studio: initial schema (spec section 5). Registry, runs, sign-off queue and place manifests live in Postgres with PostGIS.
create extension if not exists postgis;

create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
