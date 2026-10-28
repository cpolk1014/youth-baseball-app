-- Budget view: estimates stay as each category's plan while real entries come in, so the
-- "planned" and "expected" totals are now the part of each category's plan not yet used.
-- Everything else in finance_summary is unchanged.

-- Team totals for everyone on the team (no family details). Same math as moneySummary()
-- in src/lib/finance/ledger.ts. Planned and expected
-- amounts are each category's budget not yet spent or received.
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
  -- Budget by category: estimates are the plan, real entries what actually happened.
  with budget as (
    select type, coalesce(category, '') as category,
      coalesce(sum(amount_cents) filter (where estimate), 0) as planned,
      coalesce(sum(amount_cents) filter (where not estimate), 0) as actual
    from public.finance_entry
    where season_id = p_season_id and type in ('walkoff', 'grand_slam')
    group by type, coalesce(category, '')
  ),
  t as (
    select
      coalesce(sum(amount_cents) filter (where type = 'bat_around'), 0) as bat_around,
      coalesce(sum(amount_cents) filter (where type = 'cleanup'), 0) as cleanup,
      coalesce(sum(amount_cents) filter (where type = 'grand_slam' and not estimate), 0) as grand_slam,
      coalesce(sum(amount_cents) filter (where type = 'rain_check'), 0) as rain_check,
      coalesce(sum(amount_cents) filter (where type = 'walkoff' and not estimate), 0) as walkoff,
      coalesce(sum(amount_cents) filter (where type = 'safe_at_home' and not refund), 0)
        - coalesce(sum(amount_cents) filter (where type = 'safe_at_home' and refund), 0) as collected,
      (select coalesce(sum(greatest(0, b.planned - b.actual)), 0) from budget b where b.type = 'walkoff') as planned_out,
      (select coalesce(sum(greatest(0, b.planned - b.actual)), 0) from budget b where b.type = 'grand_slam') as expected_in
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
