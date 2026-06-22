-- ============================================================
-- Penance CRM — Supabase schema
-- Run this once in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- One row per user, holding their entire pipeline as a single JSON blob.
-- This mirrors exactly what the app already stored in localStorage —
-- deals, buyers, contacts, contract templates, everything — just moved
-- from "this browser" to "this account."
create table if not exists pipelines (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- One row per user, tracking trial / subscription state.
create table if not exists subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'trialing',          -- trialing | active | past_due | canceled
  trial_ends_at timestamptz not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

-- Row Level Security — without this, anyone with the public API key could
-- read or write any row. These policies make Postgres itself enforce that
-- a user can only ever touch their own row, no matter what the app code does.
alter table pipelines enable row level security;
alter table subscriptions enable row level security;

create policy "Users can read their own pipeline"
  on pipelines for select
  using (auth.uid() = user_id);

create policy "Users can insert their own pipeline"
  on pipelines for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own pipeline"
  on pipelines for update
  using (auth.uid() = user_id);

create policy "Users can read their own subscription"
  on subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own subscription"
  on subscriptions for insert
  with check (auth.uid() = user_id);

-- Subscription UPDATEs (e.g. trial -> active after payment) happen from the
-- Stripe webhook using the service-role key, which bypasses RLS entirely —
-- so there's deliberately no "users can update their own subscription"
-- policy. A user being able to set their own status to "active" without
-- paying would defeat the entire point.

-- Auto-create a trial subscription row the moment someone signs up, so the
-- app never has to handle "user exists but has no subscription row yet."
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.subscriptions (user_id, status, trial_ends_at)
  values (new.id, 'trialing', now() + interval '3 days');
  insert into public.pipelines (user_id, data)
  values (new.id, '{}'::jsonb);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
