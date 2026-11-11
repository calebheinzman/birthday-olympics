-- Party order: Bodies moves to after Betrayal and Beerio Kart (King's Cup stays hidden).
update public.events e set sort_order=o.n from (values
 ('Arms, Shuff & Pool',1),('King''s Cup',2),('Betrayal',3),('Boom Cup',4),('Beerio Kart',5),('Bodies',6),('Beer Pong',7)
) o(name,n) where e.name=o.name;
