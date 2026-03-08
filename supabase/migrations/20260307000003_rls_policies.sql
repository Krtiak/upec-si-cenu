-- ============================================================
-- Migration 3: Row Level Security (RLS)
-- Bezpečnostná vrstva — každá cukráreň vidí IBA svoje dáta.
-- ============================================================

-- Helper funkcia: vráti bakery_id prihláseného usera
-- Volaná v každej RLS policy — výsledok je cachovaný per transakciu.
create or replace function auth_bakery_id()
returns uuid
language sql stable
as $$
  select bakery_id
  from bakery_members
  where user_id = auth.uid()
  limit 1;
$$;

-- Helper funkcia: je prihlásený user super_admin?
create or replace function is_super_admin()
returns boolean
language sql stable
as $$
  select exists (
    select 1 from bakery_members
    where user_id = auth.uid() and role = 'super_admin'
  );
$$;

-- ============================================================
-- bakeries
-- ============================================================
alter table bakeries enable row level security;

-- Každý vidí len svoju cukráreň (alebo super_admin vidí všetky)
create policy "bakeries_select" on bakeries
  for select using (
    id = auth_bakery_id() or is_super_admin()
  );

create policy "bakeries_update" on bakeries
  for update using (
    id = auth_bakery_id() or is_super_admin()
  );

-- Len super_admin môže vkladať nové cukrárne
create policy "bakeries_insert" on bakeries
  for insert with check (is_super_admin());

-- ============================================================
-- bakery_members
-- ============================================================
alter table bakery_members enable row level security;

create policy "bakery_members_select" on bakery_members
  for select using (
    user_id = auth.uid() or is_super_admin()
  );

-- ============================================================
-- section_meta
-- ============================================================
alter table section_meta enable row level security;

-- Verejný read (zákazníci na homepage nepotrebujú byť prihlásení)
create policy "section_meta_public_read" on section_meta
  for select using (
    bakery_id in (select id from bakeries where is_active = true)
  );

-- Write len vlastník alebo super_admin
create policy "section_meta_owner_write" on section_meta
  for all using (
    bakery_id = auth_bakery_id() or is_super_admin()
  );

-- ============================================================
-- section_options
-- ============================================================
alter table section_options enable row level security;

create policy "section_options_public_read" on section_options
  for select using (
    bakery_id in (select id from bakeries where is_active = true)
  );

create policy "section_options_owner_write" on section_options
  for all using (
    bakery_id = auth_bakery_id() or is_super_admin()
  );

-- ============================================================
-- diameter_multipliers
-- ============================================================
alter table diameter_multipliers enable row level security;

create policy "diameter_multipliers_public_read" on diameter_multipliers
  for select using (
    bakery_id in (select id from bakeries where is_active = true)
  );

create policy "diameter_multipliers_owner_write" on diameter_multipliers
  for all using (
    bakery_id = auth_bakery_id() or is_super_admin()
  );

-- ============================================================
-- recipes & ingredients (súkromné — len majiteľka vidí)
-- ============================================================
alter table recipes enable row level security;

create policy "recipes_owner" on recipes
  for all using (
    bakery_id = auth_bakery_id() or is_super_admin()
  );

alter table ingredients enable row level security;

create policy "ingredients_owner" on ingredients
  for all using (
    bakery_id = auth_bakery_id() or is_super_admin()
  );

-- ============================================================
-- page_visits (len owner a super_admin môžu čítať)
-- Edge funkcia s SERVICE_ROLE klúčom zapisuje bez RLS.
-- ============================================================
alter table page_visits enable row level security;

create policy "page_visits_owner_read" on page_visits
  for select using (
    bakery_id = auth_bakery_id() or is_super_admin()
  );
