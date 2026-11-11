-- Ice Tray Relay: trays are filled with beer; each player drains one tray, then the next teammate goes.
update public.events set summary='Drain the tray. Tag the next one.', equipment='Ice cube trays, beer',
 rules=E'Setup — Line up the ice trays in a row for each team, for example 16 trays for four teams. Fill every tray with beer.\nPlay — One player at a time sucks all the beer out of one tray. When it’s empty, the next teammate starts on the next tray, and so on down the line.\nWin — The first team to empty all of its trays wins. Teams place in the order they finish.'
 where name='Ice Tray Relay';
