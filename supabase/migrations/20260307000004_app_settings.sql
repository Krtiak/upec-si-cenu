-- ============================================================
-- Migration 4: app_settings per bakery
-- Namiesto globálnych nastavení má každá cukráreň vlastné.
-- Theme výber z AdminPanel sa ukladá sem.
-- ============================================================

create table if not exists app_settings (
  id          uuid primary key default gen_random_uuid(),
  bakery_id   uuid not null references bakeries(id) on delete cascade,
  key         text not null,
  value       text not null,
  updated_at  timestamptz not null default now(),
  unique(bakery_id, key)
);

create index if not exists idx_app_settings_bakery_id on app_settings(bakery_id);

-- RLS
alter table app_settings enable row level security;

-- Verejný read témy (homepage potrebuje farby aj bez prihlásenia)
create policy "app_settings_public_read" on app_settings
  for select using (
    bakery_id in (select id from bakeries where is_active = true)
  );

create policy "app_settings_owner_write" on app_settings
  for all using (
    bakery_id = auth_bakery_id() or is_super_admin()
  );

-- Predvolené nastavenia pre prvú cukráreň
insert into app_settings (bakery_id, key, value)
values
  ('00000000-0000-0000-0000-000000000001', 'theme', 'pink')
on conflict (bakery_id, key) do nothing;
