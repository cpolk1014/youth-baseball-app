-- Box scores belong to a real game: a parent's import is matched to one of the kid's team's
-- games (and confirmed) before it's saved. The game's date and opponent are used, so the box
-- score's spelling doesn't matter, and two games on one day against the same team stay apart.
-- Box scores imported before this keep working without a game.

alter table public.player_game_stat
  add column game_id uuid references public.game (id) on delete set null;

-- One box score per kid per game (older ones without a game don't count).
alter table public.player_game_stat drop constraint player_game_stat_player_id_game_date_opponent_key;
alter table public.player_game_stat
  add constraint player_game_stat_player_game unique (player_id, game_id);

create function public.check_box_score_game()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game record;
begin
  if new.game_id is null then
    -- New imports must name the game; older rows can still be fixed or removed.
    if tg_op = 'INSERT' then
      raise exception 'Pick the game this box score is from.' using errcode = '23514';
    end if;
    return new;
  end if;
  select g.game_date, g.opponent, g.season_id, s.team_id into v_game
  from public.game g join public.season s on s.id = g.season_id
  where g.id = new.game_id;
  if v_game is null or v_game.team_id is distinct from public.player_team_id(new.player_id) then
    raise exception 'That game isn''t on this player''s team.' using errcode = '23514';
  end if;
  new.game_date := v_game.game_date;
  new.opponent := left(v_game.opponent, 80);
  new.season_id := v_game.season_id;
  return new;
end;
$$;

create trigger player_game_stat_game
  before insert or update of game_id, player_id on public.player_game_stat
  for each row execute function public.check_box_score_game();
