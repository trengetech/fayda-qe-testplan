-- QE test plan: its own schema, so nothing here touches the app's tables and the API tests (which wipe `public`) never touch it.
-- Anyone with the page link can read, add results and comments, and add or edit steps (founder's choice, 1 Nov 2026: a small
-- trusted QE group, a name box instead of a login). Nobody can delete: a step is archived, a result is superseded by a newer one.
-- Safe to run again.

create schema if not exists qe;

create table if not exists qe.steps (
  id           uuid primary key default gen_random_uuid(),
  section      text not null check (length(section) between 1 and 120),
  section_pos  integer not null default 0,
  pos          integer not null default 0,
  title        text not null check (length(title) between 1 and 300),
  detail       text not null default '' check (length(detail) <= 4000),
  expected     text not null default '' check (length(expected) <= 2000),
  archived     boolean not null default false,
  created_by   text not null default '' check (length(created_by) <= 80),
  updated_by   text not null default '' check (length(updated_by) <= 80),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One row per mark. The current mark of a tester on a step in a run is their newest row.
create table if not exists qe.results (
  id          uuid primary key default gen_random_uuid(),
  step_id     uuid not null references qe.steps(id),
  run         text not null default 'Run 1' check (length(run) between 1 and 60),
  tester      text not null check (length(trim(tester)) between 1 and 80),
  status      text not null check (status in ('pass', 'fail', 'blocked', 'skipped')),
  build       text not null default '' check (length(build) <= 80),
  device      text not null default '' check (length(device) <= 120),
  comment     text not null default '' check (length(comment) <= 2000),
  created_at  timestamptz not null default now()
);
create index if not exists results_step_idx on qe.results (step_id, created_at desc);

-- Free comments on a step, separate from a pass or fail.
create table if not exists qe.notes (
  id          uuid primary key default gen_random_uuid(),
  step_id     uuid not null references qe.steps(id),
  tester      text not null check (length(trim(tester)) between 1 and 80),
  body        text not null check (length(trim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists notes_step_idx on qe.notes (step_id, created_at);

alter table qe.steps   enable row level security;
alter table qe.results enable row level security;
alter table qe.notes   enable row level security;

drop policy if exists steps_read    on qe.steps;
drop policy if exists steps_add     on qe.steps;
drop policy if exists steps_edit    on qe.steps;
drop policy if exists results_read  on qe.results;
drop policy if exists results_add   on qe.results;
drop policy if exists notes_read    on qe.notes;
drop policy if exists notes_add     on qe.notes;
create policy steps_read   on qe.steps   for select to anon using (true);
create policy steps_add    on qe.steps   for insert to anon with check (true);
create policy steps_edit   on qe.steps   for update to anon using (true) with check (true);
create policy results_read on qe.results for select to anon using (true);
create policy results_add  on qe.results for insert to anon with check (true);
create policy notes_read   on qe.notes   for select to anon using (true);
create policy notes_add    on qe.notes   for insert to anon with check (true);

-- Privileges: read and add everywhere, edit steps only, never delete. Nothing in `public` is granted to anon here.
grant usage on schema qe to anon;
revoke all on all tables in schema qe from anon;
grant select, insert on qe.results, qe.notes to anon;
grant select, insert on qe.steps to anon;
grant update (section, section_pos, pos, title, detail, expected, archived, updated_by, updated_at) on qe.steps to anon;

-- Stamp updated_at on every edit, whatever the page sent.
create or replace function qe.touch_step() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists steps_touch on qe.steps;
create trigger steps_touch before update on qe.steps for each row execute function qe.touch_step();
