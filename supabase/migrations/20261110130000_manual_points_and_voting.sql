-- Manual point edits: per-event overrides ({team id: points}) and a per-team adjustment to the overall total.
alter table public.events add column point_overrides jsonb not null default '{}'::jsonb check(jsonb_typeof(point_overrides)='object');
alter table public.teams add column points_adjustment integer not null default 0 check(points_adjustment between -9999 and 9999);

-- Live voting (Bodies). Guests never read these tables directly: vote_state() hides the
-- breakdown until the organizer releases it, and cast_vote() only accepts votes while open.
create table public.vote_candidates(
 id uuid primary key default gen_random_uuid(),
 name text not null check(char_length(trim(name)) between 1 and 40),
 sort_order integer not null default 0
);
create table public.vote_session(
 id boolean primary key default true check(id),
 status text not null default 'idle' check(status in ('idle','open','paused','released')),
 round integer not null default 1,
 duration integer not null default 30 check(duration between 5 and 600),
 ends_at timestamptz,
 remaining integer not null default 0
);
insert into public.vote_session default values;
create table public.votes(
 voter_id uuid primary key,
 team_id uuid not null references public.teams(id) on delete cascade,
 candidate_id uuid not null references public.vote_candidates(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.vote_candidates enable row level security;
alter table public.vote_session enable row level security;
alter table public.votes enable row level security;
revoke all on public.vote_candidates,public.vote_session,public.votes from anon,authenticated;
grant select,insert,update,delete on public.vote_candidates to authenticated;
create policy "Organizer candidates" on public.vote_candidates for all to authenticated using((select auth.uid())='d644c5f2-6a2a-47f5-8cb6-d0b58f08c928'::uuid) with check((select auth.uid())='d644c5f2-6a2a-47f5-8cb6-d0b58f08c928'::uuid);

create function public.vote_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.vote_session; show boolean;
begin
 select * into s from public.vote_session;
 show := s.status='released' or (select auth.uid())='d644c5f2-6a2a-47f5-8cb6-d0b58f08c928'::uuid;
 return jsonb_build_object('now',clock_timestamp(),'status',s.status,'round',s.round,'duration',s.duration,'ends_at',s.ends_at,'remaining',s.remaining,
  'candidates',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'sort_order',c.sort_order) order by c.sort_order,c.name) from public.vote_candidates c),'[]'::jsonb),
  'total',(select count(*) from public.votes),
  'results',case when show then coalesce((select jsonb_agg(jsonb_build_object('candidate_id',x.candidate_id,'team_id',x.team_id,'n',x.n)) from (select v.candidate_id,v.team_id,count(*) n from public.votes v group by 1,2) x),'[]'::jsonb) end);
end; $$;

create function public.cast_vote(p_voter uuid,p_team uuid,p_candidate uuid,p_round integer) returns void language plpgsql security definer set search_path='' as $$
declare s public.vote_session;
begin
 select * into s from public.vote_session;
 if s.status<>'open' or s.round<>p_round or clock_timestamp()>s.ends_at+interval '1 second' then raise exception 'Voting is closed.'; end if;
 if p_voter is null or not exists(select 1 from public.teams t where t.id=p_team) then raise exception 'Pick your team color first.'; end if;
 if not exists(select 1 from public.vote_candidates c where c.id=p_candidate) then raise exception 'That name is no longer on the ballot.'; end if;
 insert into public.votes(voter_id,team_id,candidate_id) values(p_voter,p_team,p_candidate)
  on conflict(voter_id) do update set team_id=excluded.team_id,candidate_id=excluded.candidate_id,created_at=now();
end; $$;

create function public.vote_control(p_action text,p_seconds integer default 30) returns void language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is distinct from 'd644c5f2-6a2a-47f5-8cb6-d0b58f08c928'::uuid then raise exception 'Only the organizer can run a vote.'; end if;
 if p_action='start' then
  if p_seconds is null or p_seconds not between 5 and 600 then raise exception 'Choose between 5 and 600 seconds.'; end if;
  delete from public.votes where true;
  update public.vote_session set status='open',round=round+1,duration=p_seconds,ends_at=clock_timestamp()+make_interval(secs=>p_seconds),remaining=0 where id;
 elsif p_action='pause' then
  update public.vote_session set status='paused',remaining=ceil(extract(epoch from ends_at-clock_timestamp()))::integer where id and status='open' and ends_at>clock_timestamp();
 elsif p_action='resume' then
  update public.vote_session set status='open',ends_at=clock_timestamp()+make_interval(secs=>remaining),remaining=0 where id and status='paused';
 elsif p_action='release' then
  update public.vote_session set status='released' where id and status<>'idle';
 elsif p_action='reset' then
  delete from public.votes where true;
  update public.vote_session set status='idle',round=round+1,ends_at=null,remaining=0 where id;
 else raise exception 'Unknown voting action.';
 end if;
end; $$;
revoke execute on function public.vote_state(),public.cast_vote(uuid,uuid,uuid,integer),public.vote_control(text,integer) from public;
grant execute on function public.vote_state(),public.cast_vote(uuid,uuid,uuid,integer) to anon,authenticated;
grant execute on function public.vote_control(text,integer) to authenticated;
