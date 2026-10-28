-- Receipts on Walkoffs: a photo or PDF in a private storage bucket, one per Walkoff.
-- Files live at receipts/<team id>/<entry id>/<file>. Everyone on the team can view them
-- (they can already see every Walkoff); coaches and treasurers add and remove them.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts', 'receipts', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;

-- The team a receipt belongs to, from the first folder of its path (null if it isn't a uuid).
create function public.receipt_team_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[1])::uuid
  end
$$;
grant execute on function public.receipt_team_id(text) to authenticated;

create policy "team members can view receipts" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and public.is_team_member(public.receipt_team_id(name)));
create policy "coaches and treasurers add receipts" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.has_team_role(public.receipt_team_id(name), '{coach,treasurer}')
  );
create policy "coaches and treasurers replace receipts" on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and public.has_team_role(public.receipt_team_id(name), '{coach,treasurer}'))
  with check (bucket_id = 'receipts' and public.has_team_role(public.receipt_team_id(name), '{coach,treasurer}'));
create policy "coaches and treasurers remove receipts" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and public.has_team_role(public.receipt_team_id(name), '{coach,treasurer}'));

alter table public.finance_entry
  add column receipt_path text check (
    receipt_path is null or (type = 'walkoff' and length(receipt_path) <= 300)
  );

-- save_finance_entry now saves the receipt path too (otherwise unchanged).
create or replace function public.save_finance_entry(p_entry jsonb, p_shares jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := (p_entry ->> 'id')::uuid;
  v_type text := p_entry ->> 'type';
  v_amount integer := (p_entry ->> 'amount_cents')::integer;
  v_team uuid;
  v_count integer := jsonb_array_length(p_shares);
  v_sum integer;
begin
  insert into public.finance_entry (
    id, season_id, type, title, amount_cents, entry_date, category, payee, method, refund,
    estimate, due_dates, note, receipt_path
  ) values (
    v_id,
    (p_entry ->> 'season_id')::uuid,
    v_type,
    p_entry ->> 'title',
    v_amount,
    (p_entry ->> 'entry_date')::date,
    p_entry ->> 'category',
    p_entry ->> 'payee',
    p_entry ->> 'method',
    coalesce((p_entry ->> 'refund')::boolean, false),
    coalesce((p_entry ->> 'estimate')::boolean, false),
    coalesce(
      (select array_agg(d::date) from jsonb_array_elements_text(p_entry -> 'due_dates') d),
      '{}'
    ),
    p_entry ->> 'note',
    p_entry ->> 'receipt_path'
  )
  on conflict (id) do update set
    season_id = excluded.season_id, type = excluded.type, title = excluded.title,
    amount_cents = excluded.amount_cents, entry_date = excluded.entry_date,
    category = excluded.category, payee = excluded.payee, method = excluded.method,
    refund = excluded.refund, estimate = excluded.estimate, due_dates = excluded.due_dates,
    note = excluded.note, receipt_path = excluded.receipt_path;

  select coalesce(sum((s ->> 'amount_cents')::integer), 0) into v_sum
  from jsonb_array_elements(p_shares) s;
  if v_type in ('walkoff', 'grand_slam') and v_count <> 0 then
    raise exception 'A % is not tagged to players', v_type using errcode = 'check_violation';
  elsif v_type in ('cleanup', 'safe_at_home', 'rain_check') and v_count <> 1 then
    raise exception 'A % is tagged to exactly one player', v_type using errcode = 'check_violation';
  elsif v_type = 'bat_around' and v_count = 0 then
    raise exception 'A Bat Around needs at least one player' using errcode = 'check_violation';
  elsif v_count > 0 and v_sum <> v_amount then
    raise exception 'Shares add up to %, not %', v_sum, v_amount using errcode = 'check_violation';
  end if;

  v_team := public.finance_entry_team_id(v_id);
  if exists (
    select 1 from jsonb_array_elements(p_shares) s
    left join public.player p on p.id = (s ->> 'player_id')::uuid
    where p.team_id is distinct from v_team
  ) then
    raise exception 'Shares must be for players on this team' using errcode = 'check_violation';
  end if;

  delete from public.finance_share where entry_id = v_id;
  insert into public.finance_share (entry_id, player_id, amount_cents)
  select v_id, (s ->> 'player_id')::uuid, (s ->> 'amount_cents')::integer
  from jsonb_array_elements(p_shares) s;
end;
$$;
