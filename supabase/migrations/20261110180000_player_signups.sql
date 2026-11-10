-- Sign-ups: guests add their own name and team color. The same list (vote_candidates) is the
-- Bodies ballot and the front-page team rosters. device_id ties a row to the phone that made it
-- and is never readable by guests.
alter table public.vote_candidates
 add column team_id uuid references public.teams(id) on delete set null,
 add column device_id uuid unique,
 add column created_at timestamptz not null default now();
grant select(id,name,team_id,sort_order) on public.vote_candidates to anon;
create policy "Public roster" on public.vote_candidates for select to anon,authenticated using(true);

create function public.join_game(p_device uuid,p_name text,p_team uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare pid uuid;
begin
 if p_device is null then raise exception 'Could not save on this phone. Reload and try again.'; end if;
 if p_name is null or char_length(trim(p_name)) not between 1 and 40 then raise exception 'Enter a name up to 40 characters.'; end if;
 if not exists(select 1 from public.teams t where t.id=p_team) then raise exception 'Pick your team color.'; end if;
 if not exists(select 1 from public.vote_candidates c where c.device_id=p_device) and (select count(*) from public.vote_candidates)>=150 then raise exception 'The sign-up list is full. Ask the organizer.'; end if;
 insert into public.vote_candidates(name,team_id,device_id) values(trim(p_name),p_team,p_device)
  on conflict(device_id) do update set name=excluded.name,team_id=excluded.team_id returning id into pid;
 return pid;
end; $$;
revoke execute on function public.join_game(uuid,text,uuid) from public;
grant execute on function public.join_game(uuid,text,uuid) to anon,authenticated;

-- The ballot now carries each person's team so it can show their color.
create or replace function public.vote_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.vote_session; organizer boolean; show boolean;
begin
 select * into s from public.vote_session;
 organizer := (select auth.uid())='d644c5f2-6a2a-47f5-8cb6-d0b58f08c928'::uuid;
 show := s.status='released' or organizer;
 return jsonb_build_object('now',clock_timestamp(),'status',s.status,'round',s.round,'duration',s.duration,'ends_at',s.ends_at,'remaining',s.remaining,
  'candidates',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'team_id',c.team_id,'sort_order',c.sort_order) order by c.name) from public.vote_candidates c),'[]'::jsonb),
  'total',(select count(*) from public.votes),
  'results',case when show then coalesce((select jsonb_agg(jsonb_build_object('candidate_id',x.candidate_id,'team_id',x.team_id,'n',x.n)) from (select v.candidate_id,v.team_id,count(*) n from public.votes v group by 1,2) x),'[]'::jsonb) end,
  'history',case when organizer then coalesce((select jsonb_agg(jsonb_build_object('round',h.round,'name',h.candidate_name,'team_id',h.team_id,'n',h.n) order by h.round,h.id) from public.vote_history h),'[]'::jsonb) end);
end; $$;
