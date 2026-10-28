-- Undo the budget view's change to finance_summary (the budget view was removed): put back
-- the original team totals, where "planned" and "expected" are simply the sum of estimates.
-- Same function as in 20261028000000_team_money.sql; safe to run on any database.

-- Team totals for everyone on the team (no family details). Same math as moneySummary()
-- in src/lib/finance/ledger.ts.
create or replace function public.finance_summary(p_season_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  if not public.is_team_member(public.season_team_id(p_season_id)) then
    raise exception 'Not on this team' using errcode = 'insufficient_privilege';
  end if;
  with t as (
    select
      coalesce(sum(amount_cents) filter (where type = 'bat_around'), 0) as bat_around,
      coalesce(sum(amount_cents) filter (where type = 'cleanup'), 0) as cleanup,
      coalesce(sum(amount_cents) filter (where type = 'grand_slam' and not estimate), 0) as grand_slam,
      coalesce(sum(amount_cents) filter (where type = 'rain_check'), 0) as rain_check,
      coalesce(sum(amount_cents) filter (where type = 'walkoff' and not estimate), 0) as walkoff,
      coalesce(sum(amount_cents) filter (where type = 'safe_at_home' and not refund), 0)
        - coalesce(sum(amount_cents) filter (where type = 'safe_at_home' and refund), 0) as collected,
      coalesce(sum(amount_cents) filter (where type = 'walkoff' and estimate), 0) as planned_out,
      coalesce(sum(amount_cents) filter (where type = 'grand_slam' and estimate), 0) as expected_in
    from public.finance_entry where season_id = p_season_id
  )
  select jsonb_build_object(
    'batAroundCents', bat_around,
    'cleanupCents', cleanup,
    'grandSlamCents', grand_slam,
    'totalInCents', bat_around + cleanup + grand_slam,
    'rainCheckCents', rain_check,
    'walkoffCents', walkoff,
    'totalOutCents', rain_check + walkoff,
    'leftOverCents', bat_around + cleanup + grand_slam - rain_check - walkoff,
    'billedCents', bat_around + cleanup - rain_check,
    'collectedCents', collected,
    'cashOnHandCents', collected + grand_slam - walkoff,
    'plannedOutCents', planned_out,
    'expectedInCents', expected_in
  ) into r from t;
  return r;
end;
$$;
