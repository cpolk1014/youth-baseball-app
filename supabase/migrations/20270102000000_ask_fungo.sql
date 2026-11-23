-- Ask Fungo: the website's help chat (no sign-in). The server (service role) checks two limits
-- before each answer, under a lock so parallel requests can't slip past:
--   a visitor's daily questions (the visitor is a one-way hash of their address that changes
--   every day, so nobody can be followed from day to day), and
--   the site's daily spend (all visitors together); past it, the chat says to email support.
-- Questions are kept (no names, no address, no visitor) so we can see what people ask, for
-- 180 days. Nothing here is readable from the browser.

create table public.ask_day (
  day date primary key,
  answers integer not null default 0,
  cents numeric not null default 0
);

create table public.ask_visitor (
  day date not null,
  visitor text not null check (char_length(visitor) between 16 and 128),
  questions integer not null default 0,
  primary key (day, visitor)
);

create table public.ask_question (
  id uuid primary key default gen_random_uuid(),
  asked_at timestamptz not null default now(),
  page text check (page is null or char_length(page) <= 100),
  question text not null check (char_length(question) <= 1000),
  -- answered | visitor_limit | site_limit | error
  outcome text not null default 'answered'
);
create index ask_question_asked_idx on public.ask_question (asked_at desc);

alter table public.ask_day enable row level security;
alter table public.ask_visitor enable row level security;
alter table public.ask_question enable row level security;
-- No policies: the server reads and writes these with the service role.

/*
 * May this visitor ask now? Counts the question when yes. Returns 'ok', 'visitor' (they've
 * hit today's questions) or 'site' (the site's spend for today is used up). Old visitor
 * counts and questions past 180 days are cleared as it goes.
 */
create function public.ask_reserve(p_visitor text, p_per_visitor integer, p_day_cents numeric)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'America/Chicago')::date;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('ask_reserve'));
  delete from public.ask_visitor where day < v_day - 1;
  if coalesce((select cents from public.ask_day where day = v_day), 0) >= p_day_cents then
    return 'site';
  end if;
  select questions into v_count from public.ask_visitor where day = v_day and visitor = p_visitor;
  if coalesce(v_count, 0) >= p_per_visitor then
    return 'visitor';
  end if;
  insert into public.ask_visitor (day, visitor, questions) values (v_day, p_visitor, 1)
  on conflict (day, visitor) do update set questions = public.ask_visitor.questions + 1;
  return 'ok';
end;
$$;

/* Record what an answer cost, and the question (without who asked). */
create function public.ask_settle(p_cents numeric, p_page text, p_question text, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'America/Chicago')::date;
begin
  if p_outcome = 'answered' then
    insert into public.ask_day (day, answers, cents) values (v_day, 1, greatest(0, p_cents))
    on conflict (day) do update
      set answers = public.ask_day.answers + 1, cents = public.ask_day.cents + greatest(0, p_cents);
  end if;
  insert into public.ask_question (page, question, outcome)
  values (left(p_page, 100), left(p_question, 1000), p_outcome);
  delete from public.ask_question where asked_at < now() - interval '180 days';
end;
$$;

revoke execute on function public.ask_reserve(text, integer, numeric) from public, anon, authenticated;
revoke execute on function public.ask_settle(numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.ask_reserve(text, integer, numeric) to service_role;
grant execute on function public.ask_settle(numeric, text, text, text) to service_role;
