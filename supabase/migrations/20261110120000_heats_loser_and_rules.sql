-- Adds heats (Beerio Kart) and one-loser (Boom Cup) formats, plus party rule updates.
-- Heats: teams race in separate heats; matching places across heats share pooled ranked points (computed in the client).
-- point_rounds holds [{"name":"Heat 1","order":[team ids in finishing order]}, ...].
alter table public.events drop constraint events_scoring_mode_check;
alter table public.events add constraint events_scoring_mode_check check(scoring_mode in ('ranked','sides','points','betrayal','heats','loser'));
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
 if new.scoring_mode not in ('points','betrayal','heats') and new.point_rounds<>'[]'::jsonb then raise exception 'Only custom-points games may have round points.'; end if;
 new.updated_at=clock_timestamp();
 return new;
end; $$;
-- Switch Beerio Kart to heats only while it is unscored.
update public.events set scoring_mode='heats', rules=rules||E'\nHeats — Three teams race in each heat. The same place in either heat earns the same points.' where name='Beerio Kart' and scoring_mode='points' and point_rounds='[]'::jsonb;

-- Boom Cup: one loser, everyone else wins (only while unscored).
update public.events set scoring_mode='loser' where name='Boom Cup' and scoring_mode='ranked' and cardinality(placements)=0;
-- Rule text updates. Each only applies if the expected original wording is present.
update public.events set rules=replace(rules,E'Win — Most stacks in three minutes wins. Ties get a 60-second extra heat.',E'Lose — Fewest stacks after three minutes loses. Every other team wins. Tied for fewest? Those teams play a 60-second extra heat.') where name='Boom Cup' and position(E'Win — Most stacks in three minutes wins. Ties get a 60-second extra heat.' in rules)>0;
update public.events set rules=replace(rules,E'Win — Play six rounds, changing opponents each round. Highest total wins; tied totals share a place.',E'Win — Each team plays one round against one opponent. Highest score wins; tied teams share a place and split its points.') where name='Betrayal' and position(E'Win — Play six rounds, changing opponents each round. Highest total wins; tied totals share a place.' in rules)>0;
update public.events set rules=replace(rules,E'Each minute — The host adds a restriction: feet stay planted at minute 1, no cup adjustments at minute 2, no talking at minute 3, look straight ahead at minute 4. Earlier restrictions stay in effect.\n',E'') where name='Arms Up' and position(E'Each minute — The host adds a restriction: feet stay planted at minute 1, no cup adjustments at minute 2, no talking at minute 3, look straight ahead at minute 4. Earlier restrictions stay in effect.\n' in rules)>0;
update public.events set rules=replace(rules,E'Out — Drop a cup, lower an arm, or break a restriction and you’re out.',E'Out — Drop a cup or lower an arm and you’re out.') where name='Arms Up' and position(E'Out — Drop a cup, lower an arm, or break a restriction and you’re out.' in rules)>0;
update public.events set rules=replace(rules,E'Time cap — Stop at five minutes.',E'Time cap — Stop at ten minutes.') where name='Arms Up' and position(E'Time cap — Stop at five minutes.' in rules)>0;
update public.events set rules=replace(rules,E'\nRedemption —',E'\nRe-rack — Once per game, ask the other team to re-rack your remaining cups into any formation.\nGentleman’s — Once per game, ask the other team to tighten your remaining cups back into place without changing the formation.\nRedemption —') where name='Beer Pong' and position(E'\nRedemption —' in rules)>0;
