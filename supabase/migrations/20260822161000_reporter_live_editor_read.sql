-- Editors can review the private request queue but cannot mutate it or access
-- unrelated reporter/KYC/payment/provider/recording records.

create policy "Active editors can read live requests"
on public.reporter_live_requests
for select to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'editor'
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'editor' and profiles.is_active
  )
);
