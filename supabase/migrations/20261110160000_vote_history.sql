-- Keep a record of every released vote: how many people on each team voted for each name.
-- Names are copied in, so removing someone from the ballot later does not erase history.
create table public.vote_history(
 id bigint generated always as identity primary key,
 round integer not null,
 candidate_name text not null,
 team_id uuid not null references public.teams(id) on delete cascade,
 n integer not null check(n>0),
 released_at timestamptz not null default now()
);
alter table public.vote_history enable row level security;
revoke all on public.vote_history from anon,authenticated;

create or replace function public.vote_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.vote_session; organizer boolean; show boolean;
begin
 select * into s from public.vote_session;
 organizer := (select auth.uid())='d644c5f2-6a2a-47f5-8cb6-d0b58f08c928'::uuid;
 show := s.status='released' or organizer;
 return jsonb_build_object('now',clock_timestamp(),'status',s.status,'round',s.round,'duration',s.duration,'ends_at',s.ends_at,'remaining',s.remaining,
  'candidates',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'sort_order',c.sort_order) order by c.sort_order,c.name) from public.vote_candidates c),'[]'::jsonb),
  'total',(select count(*) from public.votes),
  'results',case when show then coalesce((select jsonb_agg(jsonb_build_object('candidate_id',x.candidate_id,'team_id',x.team_id,'n',x.n)) from (select v.candidate_id,v.team_id,count(*) n from public.votes v group by 1,2) x),'[]'::jsonb) end,
  'history',case when organizer then coalesce((select jsonb_agg(jsonb_build_object('round',h.round,'name',h.candidate_name,'team_id',h.team_id,'n',h.n) order by h.round,h.id) from public.vote_history h),'[]'::jsonb) end);
end; $$;

create or replace function public.vote_control(p_action text,p_seconds integer default 30) returns void language plpgsql security definer set search_path='' as $$
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
  update public.vote_session set status='released' where id and status not in ('idle','released');
  if found then
   insert into public.vote_history(round,candidate_name,team_id,n)
    select (select round from public.vote_session),c.name,v.team_id,count(*) from public.votes v join public.vote_candidates c on c.id=v.candidate_id group by c.name,v.team_id;
  end if;
 elsif p_action='reset' then
  delete from public.votes where true;
  update public.vote_session set status='idle',round=round+1,ends_at=null,remaining=0 where id;
 elsif p_action='clear_history' then
  delete from public.vote_history where true;
 else raise exception 'Unknown voting action.';
 end if;
end; $$;
