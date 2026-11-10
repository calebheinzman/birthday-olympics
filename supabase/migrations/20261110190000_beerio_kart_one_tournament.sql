-- Beerio Kart is one full tournament with every team, scored as a normal ranked game (only while unscored).
update public.events set scoring_mode='ranked',
 rules=replace(replace(rules,E'Race — Play a full tournament with a new driver for each race.',E'Race — Play one full tournament with every team racing. Use a new driver for each race.'),E'\nHeats — Three teams race in each heat. The same place in either heat earns the same points.','')
 where name='Beerio Kart' and point_rounds='[]'::jsonb and cardinality(placements)=0;
