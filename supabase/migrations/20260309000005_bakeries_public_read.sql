-- Allow anonymous users to read active bakeries (needed for public landing pages)
drop policy if exists "bakeries_public_read" on bakeries;
create policy "bakeries_public_read" on bakeries
  for select using (is_active = true);
