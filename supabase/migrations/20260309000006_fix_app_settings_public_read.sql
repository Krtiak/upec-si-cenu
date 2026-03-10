-- Fix app_settings public read policy so anonymous users can load bakery themes.
-- The old policy had a subquery on bakeries which is RLS-blocked for anon users,
-- causing theme loading to silently fail on public landing pages.
drop policy if exists "app_settings_public_read" on app_settings;
create policy "app_settings_public_read" on app_settings
  for select using (true);
