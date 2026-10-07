-- מבוך החידות — online leaderboard (Supabase / PostgreSQL).
--
-- Security model
--   * The browser holds only the public anon key.
--   * The table is NOT directly readable or writable by anon/authenticated roles.
--   * Reads go through get_leaderboard(); writes go through submit_run(), a SECURITY DEFINER
--     function that re-validates every submission server-side (mirroring
--     src/services/leaderboard/validation.ts), recomputes the score, rate-limits and dedupes.
--   * This deters casual tampering. It is not, and cannot be, perfect cheat prevention for a
--     client-side game.

create table if not exists public.leaderboard_entries (
  id               uuid primary key,                      -- the run id (one row per completed run)
  player_id        uuid        not null,                  -- anonymous random per-device id
  nickname         text        not null check (char_length(nickname) between 2 and 16),
  age_group        text        not null check (age_group in ('5-7', '8-10', '11-13', '14-15', '16+')),
  score            integer     not null check (score between 0 and 20000),
  correct          smallint    not null check (correct between 0 and 16),
  wrong            smallint    not null check (wrong between 0 and 16),
  lives_lost       smallint    not null check (lives_lost between 0 and 2),
  completion_time  integer     not null check (completion_time between 1 and 1920),
  treasures        smallint    not null check (treasures between 0 and 20),
  theme            text        not null,
  maze_seed        bigint      not null check (maze_seed between 0 and 4294967295),
  started_at       timestamptz not null,
  completed_at     timestamptz not null,
  created_at       timestamptz not null default now()
);

create index if not exists leaderboard_age_score_idx on public.leaderboard_entries (age_group, score desc, completion_time asc);
create index if not exists leaderboard_player_time_idx on public.leaderboard_entries (player_id, created_at desc);

alter table public.leaderboard_entries enable row level security;
revoke all on public.leaderboard_entries from anon, authenticated;

-- ── Read ────────────────────────────────────────────────────────────────────────────────
create or replace function public.get_leaderboard(p_age_group text, p_limit integer default 50)
returns table (
  id uuid,
  player_id uuid,
  nickname text,
  age_group text,
  score integer,
  correct smallint,
  completion_time integer,
  lives_lost smallint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.player_id, e.nickname, e.age_group, e.score, e.correct, e.completion_time, e.lives_lost, e.created_at
  from public.leaderboard_entries e
  where e.age_group = p_age_group            -- age groups are never mixed
  order by e.score desc, e.completion_time asc, e.created_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- ── Write ───────────────────────────────────────────────────────────────────────────────
create or replace function public.submit_run(payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_run_id        uuid;
  v_player_id     uuid;
  v_nickname      text := payload->>'nickname';
  v_age           text := payload->>'ageGroup';
  v_theme         text := payload->>'theme';
  v_seed          bigint;
  v_started_ms    numeric;
  v_completed_ms  numeric;
  v_time          numeric;
  v_score         integer;
  v_lives_lost    integer;
  v_lives_left    integer;
  v_time_left     numeric;
  v_treasures     integer;
  v_special       numeric;
  v_optimal       integer;
  v_walked        integer;
  v_enc_count     integer;
  v_treasure_cnt  integer;
  v_answers       jsonb := payload->'answers';
  v_correct       integer := 0;
  v_wrong         integer := 0;
  v_trivia        numeric := 0;
  v_eff           numeric;
  v_total         numeric;
  v_rank          integer;
  a               jsonb;
begin
  -- Shape & types (any cast failure lands in the exception handler below).
  v_run_id       := (payload->>'runId')::uuid;
  v_player_id    := (payload->>'playerId')::uuid;
  v_seed         := (payload->>'seed')::bigint;
  v_started_ms   := (payload->>'startedAt')::numeric;
  v_completed_ms := (payload->>'completedAt')::numeric;
  v_time         := (payload->>'completionTimeSec')::numeric;
  v_score        := (payload->>'score')::integer;
  v_lives_lost   := (payload->>'livesLost')::integer;
  v_lives_left   := (payload->>'livesRemaining')::integer;
  v_time_left    := (payload->>'timeLeftSec')::numeric;
  v_treasures    := (payload->>'treasures')::integer;
  v_special      := (payload->>'specialPoints')::numeric;
  v_optimal      := (payload->>'optimalPathCells')::integer;
  v_walked       := (payload->>'walkedCells')::integer;
  v_enc_count    := (payload->>'encounterCount')::integer;
  v_treasure_cnt := (payload->>'treasureCount')::integer;

  if v_age not in ('5-7', '8-10', '11-13', '14-15', '16+') then return jsonb_build_object('ok', false, 'reason', 'bad age group'); end if;
  if v_theme not in ('ruins', 'crystal', 'forest', 'temple', 'volcanic', 'frozen', 'mystic', 'castle') then return jsonb_build_object('ok', false, 'reason', 'bad theme'); end if;
  if v_seed < 0 or v_seed > 4294967295 then return jsonb_build_object('ok', false, 'reason', 'bad seed'); end if;

  -- Nickname: 2–16 chars, letters/digits/space and a few gentle symbols, basic profanity filter.
  if v_nickname is null
     or char_length(v_nickname) not between 2 and 16
     or v_nickname !~ '^[א-תa-zA-Z0-9 _.''׳״-]+$'
     or lower(v_nickname) ~ '(fuck|shit|bitch|cunt|nigg|whore|slut|porn|nazi|hitler|rape|זונה|שרמוט|מזדיי|לזיין|נאצי|היטלר|מניאק)'
  then
    return jsonb_build_object('ok', false, 'reason', 'bad nickname');
  end if;

  -- Counts.
  if jsonb_typeof(v_answers) <> 'array' or jsonb_array_length(v_answers) > 16 then return jsonb_build_object('ok', false, 'reason', 'bad answers'); end if;
  if v_enc_count not between 1 and 16 or jsonb_array_length(v_answers) > v_enc_count then return jsonb_build_object('ok', false, 'reason', 'impossible question count'); end if;
  if v_treasure_cnt not between 0 and 20 or v_treasures not between 0 and v_treasure_cnt then return jsonb_build_object('ok', false, 'reason', 'impossible treasures'); end if;
  if v_lives_lost not between 0 and 2 or v_lives_left <> 3 - v_lives_lost then return jsonb_build_object('ok', false, 'reason', 'impossible lives'); end if;
  if v_time_left < 0 or v_time_left > 600 then return jsonb_build_object('ok', false, 'reason', 'impossible time left'); end if;
  if v_time < 1 or v_time > 1920 then return jsonb_build_object('ok', false, 'reason', 'impossible completion time'); end if;
  if v_optimal not between 2 and 400 or v_walked < v_optimal - 1 then return jsonb_build_object('ok', false, 'reason', 'impossible route'); end if;
  -- Can't outrun the fastest possible movement (4 m cells, 5.2 m/s), with 10% slack.
  if v_time < ((v_optimal - 1) * 4.0 / 5.2) * 0.9 then return jsonb_build_object('ok', false, 'reason', 'impossibly fast'); end if;
  if v_special < -500 or v_special > 0 then return jsonb_build_object('ok', false, 'reason', 'bad special points'); end if;
  if (v_completed_ms - v_started_ms) / 1000.0 < v_time * 0.8 then return jsonb_build_object('ok', false, 'reason', 'clock mismatch'); end if;
  if to_timestamp(v_completed_ms / 1000.0) > now() + interval '5 minutes' then return jsonb_build_object('ok', false, 'reason', 'future run'); end if;

  -- Recompute the score exactly as the client does (src/game/scoring/score.ts).
  for a in select * from jsonb_array_elements(v_answers) loop
    if (a->>'difficulty') not in ('easy', 'medium', 'hard', 'expert') or jsonb_typeof(a->'correct') <> 'boolean' then
      return jsonb_build_object('ok', false, 'reason', 'bad answer');
    end if;
    if (a->>'correct')::boolean then
      v_correct := v_correct + 1;
      v_trivia := v_trivia + case a->>'difficulty' when 'easy' then 100 when 'medium' then 125 when 'hard' then 150 else 200 end;
    else
      v_wrong := v_wrong + 1;
    end if;
  end loop;
  v_eff := least(1.0, v_optimal::numeric / greatest(v_walked, 1));
  v_total := v_trivia
           + round(greatest(0, v_time_left))                 -- time bonus (victory only; every submission is a victory)
           + v_lives_left * 150                              -- lives bonus
           + least(250, v_treasures * 25)                    -- treasures (capped)
           + round(300 * v_eff * v_eff)                      -- route efficiency
           + greatest(0, v_special)
           - v_wrong * 25 - v_lives_lost * 100 + least(0, v_special);
  v_total := greatest(0, least(20000, round(v_total)));
  -- Allow ±1 for floating-point rounding differences between JS and PostgreSQL.
  if abs(v_total - v_score) > 1 then return jsonb_build_object('ok', false, 'reason', 'score mismatch'); end if;

  -- Rate limiting per anonymous player.
  if exists (select 1 from public.leaderboard_entries where player_id = v_player_id and created_at > now() - interval '20 seconds') then
    return jsonb_build_object('ok', false, 'reason', 'rate limited');
  end if;
  if (select count(*) from public.leaderboard_entries where player_id = v_player_id and created_at > now() - interval '1 day') >= 40 then
    return jsonb_build_object('ok', false, 'reason', 'rate limited');
  end if;

  insert into public.leaderboard_entries
    (id, player_id, nickname, age_group, score, correct, wrong, lives_lost, completion_time, treasures, theme, maze_seed, started_at, completed_at)
  values
    (v_run_id, v_player_id, v_nickname, v_age, v_score, v_correct, v_wrong, v_lives_lost, round(v_time)::integer, v_treasures, v_theme, v_seed,
     to_timestamp(v_started_ms / 1000.0), to_timestamp(v_completed_ms / 1000.0));

  select count(*) + 1 into v_rank from public.leaderboard_entries where age_group = v_age and score > v_score;
  return jsonb_build_object('ok', true, 'rank', v_rank);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  when others then
    return jsonb_build_object('ok', false, 'reason', 'malformed');
end;
$$;

revoke all on function public.get_leaderboard(text, integer) from public;
revoke all on function public.submit_run(jsonb) from public;
grant execute on function public.get_leaderboard(text, integer) to anon, authenticated;
grant execute on function public.submit_run(jsonb) to anon, authenticated;
