-- Ice Tray Relay takes Betrayal's slot. Betrayal is hidden, not deleted, so it can come back later.
update public.events set hidden=true where name='Betrayal';
insert into public.events(name,summary,rules,equipment,duration,icon,sort_order,scoring_mode)
 select 'Ice Tray Relay','Bounce it in. Tag the next one.',E'Setup — Each team lines up behind its own ice cube tray on a table.\nPlay — One player at a time bounces a ping pong ball off the table and into the tray. Land it, then tag the next teammate. Miss? Grab the ball and try again.\nWin — The first team to have every player land a ball wins. Teams place in the order they finish.','Ice cube trays, ping pong balls','10–15 min','❄',0,'ranked'
 where not exists(select 1 from public.events where name='Ice Tray Relay');
update public.events e set sort_order=o.n from (values
 ('Arms, Shuff & Pool',1),('King''s Cup',2),('Betrayal',3),('Ice Tray Relay',4),('Boom Cup',5),('Beerio Kart',6),('Bodies',7),('Beer Pong',8)
) o(name,n) where e.name=o.name;
