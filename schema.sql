-- elllo matey I totally coded all of this by myself. No ai!
-- Zilch — full database schema
-- Paste this whole file into the Supabase SQL Editor and run it.
-- Safe to re-run, and safe to run on top of the old schema: it migrates
-- existing data where it can and drops the old open-write policies.
--
-- Security model
--   The anon key is public, so anything the anon role can SELECT is public.
--   Public tables therefore hold nothing secret. Secrets (contact details on
--   job posts, ownership hashes) live in private tables that have RLS enabled
--   and no policies at all, so the anon role can't read them. Every write
--   goes through a SECURITY DEFINER function that checks the caller's secret.
--
--   Each browser makes a random secret (localStorage "zilch.secret.v1").
--   Only its SHA-256 hash is stored. Whoever holds the secret owns the
--   profiles and claims made from that browser.

-- ---------------------------------------------------------------
-- Public tables
-- ---------------------------------------------------------------
create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null,          -- public URL slug, e.g. dmitri-k3f9
  name text not null,                   -- first name only
  area text,
  vehicle text,
  bio text,
  trips int,
  rating numeric,
  years int,
  platform text,
  contact_type text,                    -- text | call | signal | whatsapp | email
  contact_value text,                   -- public on purpose: it's the profile's contact button
  proof_path text,                      -- storage path of the stats screenshot
  verified text default 'self',         -- self | screenshot | email — set by the server only
  created_at timestamptz default now()
);

-- Note: from / to / when are reserved words in Postgres.
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ride','delivery')),
  name text,
  pickup text not null,
  dropoff text not null,
  when_text text,
  offer numeric not null,
  notes text,
  area text,
  status text not null default 'open' check (status in ('open','claimed')),
  claimed_name text,
  created_at timestamptz default now()
);

create table if not exists pledges (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('driver','rider')),
  area text not null,
  name text,
  night text,
  current_platform text,
  created_at timestamptz default now()
);

create table if not exists datapoints (
  id uuid primary key default gen_random_uuid(),
  miles numeric,
  minutes numeric,
  trips int,
  paid numeric,
  required numeric,
  shortfall numeric,
  rates text,                           -- which jurisdiction was selected
  platform text,
  created_at timestamptz default now()
);

-- Anonymous deactivation reports. Fixed choices only, no free text, so
-- nobody can post names, accusations or personal details through it.
create table if not exists deactivations (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('Uber','Lyft','DoorDash','Uber Eats','Grubhub','Instacart','Spark','Other')),
  area text check (area is null or length(area) <= 30),
  happened text not null check (happened ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),  -- YYYY-MM
  reason text not null check (reason in ('none','ratings','acceptance','fraud','background','safety','id_check','other')),
  warned boolean,
  appealed boolean,
  reinstated text check (reinstated in ('yes','no','pending')),
  years numeric check (years is null or years between 0 and 20),
  trips int check (trips is null or trips between 0 and 100000),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------
-- Private tables — no policies, so the anon key can't read or write them
-- ---------------------------------------------------------------
create table if not exists driver_owners (
  driver_id uuid primary key references drivers(id) on delete cascade,
  owner_hash text not null
);

create table if not exists request_private (
  request_id uuid primary key references requests(id) on delete cascade,
  contact text,                         -- revealed only to whoever claims
  poster_hash text,
  claimer_hash text
);

-- ---------------------------------------------------------------
-- Migration from the old schema (no-ops on a fresh database)
-- ---------------------------------------------------------------
do $$
begin
  -- Move job-post contact details out of the public table before dropping the column.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'requests' and column_name = 'contact') then
    execute 'insert into request_private (request_id, contact)
             select id, contact from requests
             on conflict (request_id) do nothing';
  end if;
end $$;

-- Old ownership keys were public, so they can't be trusted and aren't migrated.
-- Profiles made before this change have no owner; delete or reassign them in the dashboard.
alter table requests drop column if exists contact;
alter table requests drop column if exists claimed_by;
alter table requests drop column if exists posted_by;
alter table drivers  drop column if exists owner_key;

-- ---------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------
alter table drivers         enable row level security;
alter table requests        enable row level security;
alter table pledges         enable row level security;
alter table datapoints      enable row level security;
alter table deactivations   enable row level security;
alter table driver_owners   enable row level security;
alter table request_private enable row level security;

-- Old policies. Direct inserts/updates on drivers and requests are gone;
-- they go through the functions below instead.
drop policy if exists "add drivers"     on drivers;
drop policy if exists "add requests"    on requests;
drop policy if exists "claim requests"  on requests;

drop policy if exists "read drivers"    on drivers;
drop policy if exists "read requests"   on requests;
drop policy if exists "read pledges"    on pledges;
drop policy if exists "read datapoints" on datapoints;
drop policy if exists "add pledges"     on pledges;
drop policy if exists "add datapoints"  on datapoints;

create policy "read drivers"    on drivers    for select using (true);
create policy "read requests"   on requests   for select using (true);
create policy "read pledges"    on pledges    for select using (true);
create policy "read datapoints" on datapoints for select using (true);

create policy "add pledges"     on pledges    for insert with check (true);
create policy "add datapoints"  on datapoints for insert with check (true);

drop policy if exists "read deactivations" on deactivations;
drop policy if exists "add deactivations"  on deactivations;
create policy "read deactivations" on deactivations for select using (true);
create policy "add deactivations"  on deactivations for insert with check (true);

-- ---------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------
create or replace function zilch_hash(p_secret text) returns text
language plpgsql immutable as $$
begin
  if p_secret is null or length(p_secret) < 32 then
    raise exception 'bad secret';
  end if;
  return encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');
end $$;

-- A profile counts as screenshot-verified only if the file really exists in
-- the proof bucket and is named after this profile's handle.
create or replace function zilch_proof_ok(p_handle text, p_path text) returns boolean
language sql stable security definer set search_path = public, storage as $$
  select p_path is not null
     and p_path like p_handle || '.%'
     and exists (select 1 from storage.objects o
                 where o.bucket_id = 'proof' and o.name = p_path);
$$;

create or replace function create_driver(p_secret text, p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_handle text := p->>'handle';
  v_proof  text := nullif(p->>'proof_path', '');
  v_id     uuid;
begin
  if v_handle is null or v_handle !~ '^[a-z0-9]{1,14}-[a-z0-9]{4}$' then
    raise exception 'bad handle';
  end if;
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'name required'; end if;
  if coalesce((p->>'rating')::numeric, 0) not between 1 and 5 then raise exception 'bad rating'; end if;
  if coalesce((p->>'trips')::int, -1) < 0 then raise exception 'bad trips'; end if;
  if not zilch_proof_ok(v_handle, v_proof) then v_proof := null; end if;

  insert into drivers (handle, name, area, vehicle, bio, trips, rating, years,
                       platform, contact_type, contact_value, proof_path, verified)
  values (v_handle,
          left(trim(p->>'name'), 24),
          left(p->>'area', 30),
          left(p->>'vehicle', 50),
          left(nullif(p->>'bio', ''), 200),
          (p->>'trips')::int,
          (p->>'rating')::numeric,
          nullif(p->>'years', '')::int,
          left(nullif(p->>'platform', ''), 30),
          left(p->>'contact_type', 12),
          left(p->>'contact_value', 60),
          v_proof,
          case when v_proof is not null then 'screenshot' else 'self' end)
  returning id into v_id;

  insert into driver_owners (driver_id, owner_hash) values (v_id, zilch_hash(p_secret));
  return v_handle;
end $$;

-- Edit your own profile. Changing trips or rating without a new screenshot
-- drops the badge back to self-reported, since the old screenshot no longer matches.
create or replace function update_driver(p_secret text, p_handle text, p jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  d        drivers%rowtype;
  v_proof  text := nullif(p->>'proof_path', '');
  v_trips  int  := (p->>'trips')::int;
  v_rating numeric := (p->>'rating')::numeric;
  v_verified text;
begin
  select dr.* into d from drivers dr
    join driver_owners o on o.driver_id = dr.id
   where dr.handle = p_handle and o.owner_hash = zilch_hash(p_secret);
  if not found then return false; end if;

  if coalesce(trim(p->>'name'), '') = '' then raise exception 'name required'; end if;
  if coalesce(v_rating, 0) not between 1 and 5 then raise exception 'bad rating'; end if;
  if coalesce(v_trips, -1) < 0 then raise exception 'bad trips'; end if;

  if v_proof is not null and zilch_proof_ok(p_handle, v_proof) then
    v_verified := 'screenshot';
  elsif v_trips is distinct from d.trips or v_rating is distinct from d.rating then
    v_verified := 'self';
    v_proof := null;
  else
    v_verified := d.verified;
    v_proof := d.proof_path;
  end if;

  update drivers set
    name          = left(trim(p->>'name'), 24),
    area          = left(p->>'area', 30),
    vehicle       = left(p->>'vehicle', 50),
    bio           = left(nullif(p->>'bio', ''), 200),
    trips         = v_trips,
    rating        = v_rating,
    years         = nullif(p->>'years', '')::int,
    platform      = left(nullif(p->>'platform', ''), 30),
    contact_type  = left(p->>'contact_type', 12),
    contact_value = left(p->>'contact_value', 60),
    proof_path    = v_proof,
    verified      = v_verified
  where id = d.id;
  return true;
end $$;

create or replace function delete_driver(p_secret text, p_handle text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select dr.id into v_id from drivers dr
    join driver_owners o on o.driver_id = dr.id
   where dr.handle = p_handle and o.owner_hash = zilch_hash(p_secret);
  if not found then return false; end if;
  delete from drivers where id = v_id;   -- driver_owners row cascades
  return true;
end $$;

create or replace function post_request(p_secret text, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p->>'kind' not in ('ride', 'delivery') then raise exception 'bad kind'; end if;
  if coalesce(trim(p->>'pickup'), '') = '' or coalesce(trim(p->>'dropoff'), '') = '' then
    raise exception 'pickup and dropoff required';
  end if;
  if coalesce((p->>'offer')::numeric, 0) < 5 then raise exception 'offer too low'; end if;

  insert into requests (kind, name, pickup, dropoff, when_text, offer, notes, area, status)
  values (p->>'kind',
          left(coalesce(nullif(trim(p->>'name'), ''), 'Someone'), 24),
          left(trim(p->>'pickup'), 70),
          left(trim(p->>'dropoff'), 70),
          left(p->>'when_text', 40),
          round((p->>'offer')::numeric),
          left(p->>'notes', 180),
          left(nullif(p->>'area', ''), 30),
          'open')
  returning id into v_id;

  insert into request_private (request_id, contact, poster_hash)
  values (v_id, left(nullif(trim(p->>'contact'), ''), 80), zilch_hash(p_secret));
  return v_id;
end $$;

-- The claim lock: the update only matches a row that is still open, so two
-- drivers racing the same job can't both win. Returns the poster's contact.
create or replace function claim_request(p_secret text, p_id uuid, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare v_contact text;
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'name required'; end if;

  update requests set status = 'claimed', claimed_name = left(trim(p_name), 24)
   where id = p_id and status = 'open';
  if not found then raise exception 'taken'; end if;

  update request_private set claimer_hash = zilch_hash(p_secret)
   where request_id = p_id
  returning contact into v_contact;
  return v_contact;
end $$;

-- Contact details for every job this browser has claimed.
create or replace function my_claims(p_secret text)
returns table (request_id uuid, contact text)
language sql stable security definer set search_path = public as $$
  select rp.request_id, rp.contact from request_private rp
   where rp.claimer_hash = zilch_hash(p_secret);
$$;

-- Which of these handles belong to this browser (for showing edit/delete).
create or replace function owns_driver(p_secret text, p_handle text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from drivers dr join driver_owners o on o.driver_id = dr.id
                  where dr.handle = p_handle and o.owner_hash = zilch_hash(p_secret));
$$;

revoke all on function zilch_proof_ok(text, text) from public, anon, authenticated;
revoke all on function create_driver(text, jsonb), update_driver(text, text, jsonb),
  delete_driver(text, text), post_request(text, jsonb), claim_request(text, uuid, text),
  my_claims(text), owns_driver(text, text) from public;
grant execute on function create_driver(text, jsonb), update_driver(text, text, jsonb),
  delete_driver(text, text), post_request(text, jsonb), claim_request(text, uuid, text),
  my_claims(text), owns_driver(text, text) to anon, authenticated;

-- ---------------------------------------------------------------
-- Realtime (public tables only — the private ones are never broadcast)
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['drivers', 'requests', 'pledges', 'datapoints', 'deactivations'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------
-- Storage buckets — create these in the dashboard first:
--   proof      : driver stats screenshots
--   insurance  : optional insurance uploads from the board
-- Both private, 5 MB cap, image/jpeg + image/png + application/pdf.
--
-- Upload only. There is deliberately no read policy: nobody with the public
-- key can list or download these files. You can still view them in the
-- Supabase dashboard, which uses the service role.
-- ---------------------------------------------------------------
drop policy if exists "upload proof"     on storage.objects;
drop policy if exists "read proof"       on storage.objects;
drop policy if exists "upload insurance" on storage.objects;
drop policy if exists "read insurance"   on storage.objects;

create policy "upload proof" on storage.objects
  for insert with check (bucket_id = 'proof');
create policy "upload insurance" on storage.objects
  for insert with check (bucket_id = 'insurance');
