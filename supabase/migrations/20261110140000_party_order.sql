-- Order the games to match the party schedule (early warm-ups, social games mid-party, Beer Pong to close).
update public.events e set sort_order=o.n from (values
 ('Arms Up',1),('Shuff & Pool',2),('King''s Cup',3),('Bodies',4),('Betrayal',5),('Boom Cup',6),('Beerio Kart',7),('Beer Pong',8)
) o(name,n) where e.name=o.name;
