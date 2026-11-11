-- Boom Cup rules: spell out that every team except the loser earns points.
update public.events set rules=replace(rules,E'Lose — Fewest stacks after three minutes loses. Every other team wins. Tied for fewest? Those teams play a 60-second extra heat.',E'Lose — The team with the fewest stacks after three minutes loses. Tied for fewest? Those teams play a 60-second extra heat.\nPoints — Every team earns points except the losing team.')
 where name='Boom Cup';
