-- ============================================================
-- Migration 2: Pridanie bakery_id do existujúcich tabuliek
-- Všetky existujúce dáta sa priradia k prvej cukrárni
-- (placeholder z migrácie 1).
-- ============================================================

-- Helper: UUID prvej cukrárne
do $$
declare
  default_bakery_id uuid := '00000000-0000-0000-0000-000000000001';
begin

  -- section_meta
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'section_meta' and column_name = 'bakery_id'
  ) then
    alter table section_meta
      add column bakery_id uuid references bakeries(id) on delete cascade;
    update section_meta set bakery_id = default_bakery_id where bakery_id is null;
    alter table section_meta alter column bakery_id set not null;
  end if;

  -- section_options
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'section_options' and column_name = 'bakery_id'
  ) then
    alter table section_options
      add column bakery_id uuid references bakeries(id) on delete cascade;
    update section_options set bakery_id = default_bakery_id where bakery_id is null;
    alter table section_options alter column bakery_id set not null;
  end if;

  -- diameter_multipliers
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'diameter_multipliers' and column_name = 'bakery_id'
  ) then
    alter table diameter_multipliers
      add column bakery_id uuid references bakeries(id) on delete cascade;
    update diameter_multipliers set bakery_id = default_bakery_id where bakery_id is null;
    alter table diameter_multipliers alter column bakery_id set not null;
  end if;

  -- recipes
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'recipes' and column_name = 'bakery_id'
  ) then
    alter table recipes
      add column bakery_id uuid references bakeries(id) on delete cascade;
    update recipes set bakery_id = default_bakery_id where bakery_id is null;
    alter table recipes alter column bakery_id set not null;
  end if;

  -- ingredients
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'ingredients' and column_name = 'bakery_id'
  ) then
    alter table ingredients
      add column bakery_id uuid references bakeries(id) on delete cascade;
    update ingredients set bakery_id = default_bakery_id where bakery_id is null;
    alter table ingredients alter column bakery_id set not null;
  end if;

  -- page_visits (log-visit edge funkcia)
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'page_visits' and column_name = 'bakery_id'
  ) then
    alter table page_visits
      add column bakery_id uuid references bakeries(id) on delete cascade;
    update page_visits set bakery_id = default_bakery_id where bakery_id is null;
    -- page_visits môžu byť aj bez bakery (neznáma cukráreň), preto NOT NULL nenastavíme
  end if;

end $$;

-- Výkonnostné indexy
create index if not exists idx_section_meta_bakery_id      on section_meta(bakery_id);
create index if not exists idx_section_options_bakery_id   on section_options(bakery_id);
create index if not exists idx_recipes_bakery_id           on recipes(bakery_id);
create index if not exists idx_ingredients_bakery_id       on ingredients(bakery_id);
create index if not exists idx_page_visits_bakery_id       on page_visits(bakery_id);
