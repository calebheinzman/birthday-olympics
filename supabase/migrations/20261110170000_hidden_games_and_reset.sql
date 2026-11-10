-- Hidden games stay in the database (rules and results kept) but are left out of the public site and standings.
alter table public.events add column hidden boolean not null default false;
update public.events set hidden=true where name='King''s Cup';

-- One-step score reset for the organizer: clears every result but keeps teams, games, rules and vote history.
create function public.reset_scores() returns void language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is distinct from 'd644c5f2-6a2a-47f5-8cb6-d0b58f08c928'::uuid then raise exception 'Only the organizer can reset scores.'; end if;
 update public.events set placements='{}',side_a='{}',side_b='{}',winner=null,point_rounds='[]'::jsonb,point_overrides='{}'::jsonb where true;
 update public.teams set points_adjustment=0 where points_adjustment<>0;
end; $$;
revoke execute on function public.reset_scores() from public,anon;
grant execute on function public.reset_scores() to authenticated;
