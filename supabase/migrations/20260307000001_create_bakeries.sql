-- ============================================================
-- Migration 1: Bakeries & Members
-- Základ multi-tenancy SaaS architektúry.
-- Každá cukráreň = jeden riadok v `bakeries`.
-- Supabase Auth user → bakery prepojenie cez `bakery_members`.
-- ============================================================

-- Tabuľka cukrární
create table if not exists bakeries (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,        -- URL identifikátor napr. "jana-cakes"
  name        text not null,               -- "Cukráreň Jana"
  email       text not null,
  logo_url    text,
  theme       text not null default 'pink',
  is_active   boolean not null default true,
  plan        text not null default 'free', -- 'free' | 'pro'
  created_at  timestamptz not null default now()
);

-- Prepojenie Auth user → cukráreň
-- role: 'owner' = majiteľka cukrárne, 'super_admin' = ty
create table if not exists bakery_members (
  id          uuid primary key default gen_random_uuid(),
  bakery_id   uuid not null references bakeries(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'owner', -- 'owner' | 'super_admin'
  created_at  timestamptz not null default now(),
  unique(bakery_id, user_id)
);

-- Index pre rýchle vyhľadávanie podľa user_id
create index if not exists idx_bakery_members_user_id on bakery_members(user_id);
create index if not exists idx_bakery_members_bakery_id on bakery_members(bakery_id);

-- ============================================================
-- Vlož existujúcu cukráreň (Alenka)
-- ============================================================
insert into bakeries (id, slug, name, email, theme)
values (
  '00000000-0000-0000-0000-000000000001',
  'upec-si-cenu-od-alenky',
  'Upec si Cenu od Alenky',
  'janik.spano@gmail.com',   -- ← zmeň na skutočný email z admins tabuľky
  'pink'
)
on conflict (slug) do nothing;

-- Prepoj Supabase Auth usera s cukrárňou podľa emailu.
-- Spustí sa len ak existuje user s týmto emailom v auth.users.
-- Ak ešte neexistuje, spusti znova neskôr po prvom prihlásení.
insert into bakery_members (bakery_id, user_id, role)
select
  '00000000-0000-0000-0000-000000000001',
  au.id,
  'owner'
from auth.users au
where au.email = 'janik.spano@gmail.com'   -- ← rovnaký email ako hore
on conflict (bakery_id, user_id) do nothing;
