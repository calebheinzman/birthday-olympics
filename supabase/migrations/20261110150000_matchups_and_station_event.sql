-- Matchups format: rounds of head-to-head games, ranked by win-loss record (points computed in the client).
-- Arms Up joins Shuffleboard and Pool as one three-station event.
alter table public.events drop constraint events_scoring_mode_check;
alter table public.events add constraint events_scoring_mode_check check(scoring_mode in ('ranked','sides','points','betrayal','heats','loser','matchups'));
create or replace function public.validate_event() returns trigger language plpgsql security invoker set search_path='' as $$
declare participants uuid[]; r jsonb; k text; v jsonb;
begin
 perform pg_advisory_xact_lock(300030);
 if jsonb_typeof(new.point_rounds) is distinct from 'array' then raise exception 'Rounds must be an array.'; end if;
 if new.scoring_mode='heats' then
  if cardinality(new.placements)>0 or cardinality(new.side_a)>0 or cardinality(new.side_b)>0 or new.winner is not null then raise exception 'Heat games cannot also have placement or side results.'; end if;
  if jsonb_array_length(new.point_rounds)>6 then raise exception 'Maximum six heats.'; end if;
  if jsonb_array_length(new.point_rounds)>0 then
   for r in select value from jsonb_array_elements(new.point_rounds) loop
    if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'name') is distinct from 'string' or char_length(trim(r->>'name')) not between 1 and 60 or jsonb_typeof(r->'order') is distinct from 'array' or jsonb_array_length(r->'order')<2 then raise exception 'Every heat needs a name and at least two teams.'; end if;
    for v in select value from jsonb_array_elements(r->'order') loop
     if jsonb_typeof(v) is distinct from 'string' then raise exception 'Heat orders must list team ids.'; end if;
    end loop;
   end loop;
   select array_agg((x#>>'{}')::uuid) into participants from jsonb_array_elements(new.point_rounds) h, jsonb_array_elements(h->'order') x;
   if cardinality(participants)<>(select count(*) from public.teams) or cardinality(participants)<>(select count(distinct x) from unnest(participants) x) or exists(select 1 from unnest(participants) x where not exists(select 1 from public.teams t where t.id=x)) then raise exception 'Put every team in exactly one heat.'; end if;
  end if;
 elsif new.scoring_mode='matchups' then
  -- point_rounds = [{"name":"Round 1","matches":[{"game":"Pool","a":team id,"b":team id,"winner":team id or null}]}]
  if cardinality(new.placements)>0 or cardinality(new.side_a)>0 or cardinality(new.side_b)>0 or new.winner is not null then raise exception 'Matchup games cannot also have placement or side results.'; end if;
  if jsonb_array_length(new.point_rounds)>10 then raise exception 'Maximum ten rounds.'; end if;
  for r in select value from jsonb_array_elements(new.point_rounds) loop
   if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'name') is distinct from 'string' or char_length(trim(r->>'name')) not between 1 and 60 or jsonb_typeof(r->'matches') is distinct from 'array' or jsonb_array_length(r->'matches') not between 1 and 12 then raise exception 'Every round needs a name and at least one matchup.'; end if;
   for v in select value from jsonb_array_elements(r->'matches') loop
    if jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'a') is distinct from 'string' or jsonb_typeof(v->'b') is distinct from 'string' or (v->>'a')=(v->>'b')
       or not exists(select 1 from public.teams t where t.id::text=(v->>'a')) or not exists(select 1 from public.teams t where t.id::text=(v->>'b'))
       or ((v->>'winner') is not null and (v->>'winner')<>(v->>'a') and (v->>'winner')<>(v->>'b'))
       or char_length(coalesce(v->>'game',''))>40 then raise exception 'Every matchup needs two different teams, and the winner must be one of them.'; end if;
   end loop;
   if (select count(*) from jsonb_array_elements(r->'matches') m, lateral (values (m->>'a'),(m->>'b')) x(id))<>(select count(distinct x.id) from jsonb_array_elements(r->'matches') m, lateral (values (m->>'a'),(m->>'b')) x(id)) then raise exception 'A team can only play once per round.'; end if;
  end loop;
 elsif new.scoring_mode in ('points','betrayal') then
  if cardinality(new.placements)>0 or cardinality(new.side_a)>0 or cardinality(new.side_b)>0 or new.winner is not null then raise exception 'Custom points cannot also have placement or side results.'; end if;
  if jsonb_array_length(new.point_rounds)>20 then raise exception 'Maximum 20 rounds.'; end if;
  if new.scoring_mode='betrayal' and jsonb_array_length(new.point_rounds)>6 then raise exception 'Maximum six Betrayal rounds.'; end if;
  for r in select value from jsonb_array_elements(new.point_rounds) loop
   if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'name') is distinct from 'string' or char_length(trim(r->>'name')) not between 1 and 60 or jsonb_typeof(r->'scores') is distinct from 'object' then raise exception 'Every round needs a name and team points.'; end if;
   if (select count(*) from jsonb_object_keys(r->'scores'))<>(select count(*) from public.teams) or exists(select 1 from public.teams t where not ((r->'scores') ? t.id::text)) then raise exception 'Enter points for every team exactly once.'; end if;
   for k,v in select key,value from jsonb_each(r->'scores') loop
    if jsonb_typeof(v) is distinct from 'number' then raise exception 'Points must be whole numbers from 0 to 999.'; end if;
    if (v::text)::numeric<0 or (v::text)::numeric>999 or trunc((v::text)::numeric)<>(v::text)::numeric then raise exception 'Points must be whole numbers from 0 to 999.'; end if;
    if new.scoring_mode='betrayal' and (v::text)::numeric not in (0,2,5) then raise exception 'Betrayal scores must be 0, 2, or 5.'; end if;
   end loop;
  end loop;
 elsif new.scoring_mode in ('ranked','loser') then
  -- loser: every team listed once, with the single loser last.
  if cardinality(new.side_a)>0 or cardinality(new.side_b)>0 or new.winner is not null then
   raise exception 'Ranked games cannot also have side results.';
  end if;
  if cardinality(new.placements)>0 then
   if cardinality(new.placements)<>(select count(*) from public.teams) or
      cardinality(new.placements)<>(select count(distinct x) from unnest(new.placements) x) or
      exists(select 1 from unnest(new.placements) x where x is null or not exists(select 1 from public.teams t where t.id=x)) then
    raise exception 'Rank every team exactly once before saving.';
   end if;
  end if;
 else
  if cardinality(new.placements)>0 then raise exception 'Two-side games cannot also have ranked placements.'; end if;
  participants=new.side_a||new.side_b;
  if cardinality(participants)<>(select count(distinct x) from unnest(participants) x) or
     exists(select 1 from unnest(participants) x where x is null or not exists(select 1 from public.teams t where t.id=x)) then
   raise exception 'Each participating color team must be on exactly one side.';
  end if;
  if new.winner is not null and (cardinality(new.side_a)=0 or cardinality(new.side_b)=0) then
   raise exception 'Put at least one color team on each side before saving a result.';
  end if;
 end if;
 if new.scoring_mode not in ('points','betrayal','heats','matchups') and new.point_rounds<>'[]'::jsonb then raise exception 'Only custom-points games may have round points.'; end if;
 new.updated_at=clock_timestamp();
 return new;
end; $$;
-- Only while both games are unscored.
update public.events set name='Arms, Shuff & Pool', scoring_mode='matchups', summary='Three stations. Head-to-head. Best record wins.', duration='2–3 rounds', rules=E'Format — Three stations run at the same time: Arms Up, Shuffleboard and Pool. Each round, every team plays one head-to-head matchup at one station. Play two or three rounds.\nArms Up — Each team nominates one player. Hold both arms straight out at shoulder height, balancing two stacked empty cups on each open palm. No gripping cups or resting your arms. Drop a cup or lower an arm and you lose. Still going at ten minutes? Rock-paper-scissors decides it.\nShuff — Alternate sliding four pucks per side. Only the side with the furthest puck scores: count its pucks beyond the opponent’s best. A puck must fully cross a line to earn that zone. First to 15 wins.\nPool — Play 8-ball. Pocket a solid or stripe after the break to claim that group. Keep shooting after a legal pot. Clear your group, then call and sink the 8-ball.\nWin — Your win–loss record across all rounds sets your place. Win every matchup and you’re first. Teams with the same record share a place and split its points.'
 where name='Shuff & Pool' and point_rounds='[]'::jsonb and cardinality(placements)=0 and winner is null
 and exists(select 1 from public.events a where a.name='Arms Up' and cardinality(a.placements)=0 and a.point_rounds='[]'::jsonb);
delete from public.events where name='Arms Up' and cardinality(placements)=0 and point_rounds='[]'::jsonb and exists(select 1 from public.events where name='Arms, Shuff & Pool');
