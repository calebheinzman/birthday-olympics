import test from 'node:test';import assert from 'node:assert/strict';import {standings,validateOrder,ordinal} from '../src/scoring.js';
const teams=['red','blue','green'].map((id,i)=>({id,sort_order:i}));
test('placements award points and edits replace previous results',()=>{let events=[{placements:['blue','red','green']}];assert.equal(standings(teams,events)[0].total,6);events[0].placements=['red','green','blue'];assert.equal(standings(teams,events)[0].id,'red');assert.equal(standings(teams,events).find(t=>t.id==='blue').total,0);});
test('unplayed events award no points; equal totals share rank',()=>{const rows=standings(teams,[{placements:[]}]);assert.deepEqual(rows.map(t=>t.rank),[1,1,1]);assert.equal(rows[0].played,0);const tied=standings(teams,[{placements:['red','blue','green']},{placements:['blue','red','green']}]);assert.deepEqual(tied.map(t=>t.rank),[1,1,3]);});
test('reject missing, duplicate and unknown teams',()=>{assert.ok(validateOrder(['red','blue','green'],teams));for(let order of [['red','blue'],['red','red','green'],['red','blue','pink']])assert.equal(validateOrder(order,teams),false)});
test('ordinal suffixes',()=>assert.deepEqual([1,2,3,4,11,12,13,21].map(ordinal),['1st','2nd','3rd','4th','11th','12th','13th','21st']));

test('two-side games give each winning color 3 and every losing color zero',async()=>{
 const {eventResult}=await import('../src/scoring.js');
 const all=['red','blue','green','yellow','purple','orange'].map((id,sort_order)=>({id,sort_order}));
 const event={scoring_mode:'sides',side_a:['red','blue','green'],side_b:['yellow','purple','orange'],winner:'a',placements:[]};
 const rows=standings(all,[event]);
 assert.deepEqual(rows.map(t=>t.total),[3,3,3,0,0,0]);
 assert.equal(rows.find(t=>t.id==='red').wins,1);
 assert.equal(eventResult(event,'yellow').label,'Loss');
 assert.equal(rows[0].total-rows.at(-1).total,3);
});
test('side-only participants, draws, corrections and mixed event totals',async()=>{
 const {eventResult}=await import('../src/scoring.js');
 const e={scoring_mode:'sides',side_a:['red'],side_b:['blue'],winner:'draw'};
 assert.deepEqual(standings(teams,[e]).map(t=>t.total),[0,0,0]);
 assert.equal(eventResult(e,'green').played,false);
 assert.equal(standings(teams,[e]).find(t=>t.id==='red').wins,0);
 e.winner='b';
 assert.equal(standings(teams,[e]).find(t=>t.id==='blue').total,3);
 assert.equal(standings(teams,[e,{placements:['red','blue','green']}]).find(t=>t.id==='red').total,6);
 e.winner=null;
 assert.equal(standings(teams,[e]).find(t=>t.id==='red').total,0);
});
test('side membership rejects overlap, empty sides and unknown teams',async()=>{
 const {validateSides}=await import('../src/scoring.js');
 assert.ok(validateSides(['red'],['blue'],'a',teams));
 assert.equal(validateSides(['red'],['red'],'a',teams),false);
 assert.equal(validateSides(['red'],[],'a',teams),false);
 assert.equal(validateSides(['red'],['pink'],'b',teams),false);
 assert.equal(validateSides(['red'],['blue'],'',teams),false);
});

 test('four- and six-team scales reward first place disproportionately and finish at zero',async()=>{const {rankedPoints}=await import('../src/scoring.js');assert.deepEqual(rankedPoints(4),[7,4,2,0]);assert.deepEqual(rankedPoints(6),[9,6,4,2,1,0]);for(let n=2;n<=12;n++){const p=rankedPoints(n);assert.equal(p.length,n);assert.equal(p.at(-1),0);assert.ok(p.every((v,i)=>i===0||p[i-1]>v));if(n>=4)assert.ok(p[0]-p[1]>p[1]-p[2]);}});

test('four color teams grouped as two sides still give losers zero',async()=>{const {eventResult}=await import('../src/scoring.js');const e={scoring_mode:'sides',side_a:['red','blue'],side_b:['green','yellow'],winner:'a'};for(const id of e.side_a)assert.equal(eventResult(e,id).points,3);for(const id of e.side_b)assert.equal(eventResult(e,id).points,0);e.winner='b';for(const id of e.side_a)assert.equal(eventResult(e,id).points,0);for(const id of e.side_b)assert.equal(eventResult(e,id).points,3);});

test('custom rounds add once, allow tied winners, and replace corrected awards',async()=>{
 const {eventResult,hasResult}=await import('../src/scoring.js');
 const e={scoring_mode:'points',point_rounds:[{name:'Pool',scores:{red:3,blue:3,green:0}},{name:'Shuffleboard',scores:{red:0,blue:0,green:3}}]};
 assert.ok(hasResult(e));
 assert.deepEqual(standings(teams,[e]).map(t=>[t.total,t.rank]),[[3,1],[3,1],[3,1]]);
 assert.equal(eventResult(e,'red').label,'Tied 1st');
 e.point_rounds[1].scores.red=3;
 assert.equal(standings(teams,[e])[0].total,6);
 assert.equal(eventResult(e,'red').label,'1st');
 assert.equal(standings(teams,[e,{placements:['green','red','blue']}]).find(t=>t.id==='red').total,9);
 e.point_rounds=[];
 assert.equal(hasResult(e),false);
 assert.deepEqual(standings(teams,[e]).map(t=>t.total),[0,0,0]);
});
test('two tournaments may have distinct winners and the same total, with zero for losses',async()=>{
 const {eventResult}=await import('../src/scoring.js');
 const e={scoring_mode:'points',point_rounds:[{name:'Tournament 1',scores:{red:3,blue:0,green:0}},{name:'Tournament 2',scores:{red:0,blue:3,green:0}}]};
 assert.equal(eventResult(e,'red').points,3);assert.equal(eventResult(e,'blue').points,3);
 assert.equal(eventResult(e,'green').points,0);assert.equal(eventResult(e,'green').win,false);
 assert.equal(eventResult(e,'blue').label,'Tied 1st');
});
test('round validation rejects missing teams, fractions, negatives and unnamed rounds',async()=>{
 const {validatePointRounds}=await import('../src/scoring.js');
 const valid={name:'Round 1',scores:{red:3,blue:3,green:0}};
 assert.ok(validatePointRounds([valid],teams));
 for(const rounds of [[],[{...valid,name:''}],[{...valid,scores:{red:3,blue:0}}],[{...valid,scores:{red:-1,blue:0,green:0}}],[{...valid,scores:{red:0.5,blue:0,green:0}}],[{...valid,scores:{red:NaN,blue:0,green:0}}]])assert.equal(validatePointRounds(rounds,teams),false);
});

test('Betrayal tallies award placement points instead of raw totals; corrections replace awards',async()=>{
 const {eventResult,validateBetrayalRounds}=await import('../src/scoring.js');
 const e={scoring_mode:'betrayal',point_rounds:[{name:'Round 1',scores:{red:5,blue:0,green:2}},{name:'Round 2',scores:{red:0,blue:5,green:2}}]};
 assert.ok(validateBetrayalRounds(e.point_rounds,teams));
 assert.equal(eventResult(e,'red').rawPoints,5);
 assert.equal(eventResult(e,'red').points,4); // tied 1st: share 6+3
 assert.equal(eventResult(e,'blue').label,'Tied 1st');
 assert.equal(eventResult(e,'green').points,0);
 e.point_rounds[1].scores.green=5;
 assert.equal(eventResult(e,'green').rawPoints,7);
 assert.equal(eventResult(e,'green').points,6);
 assert.equal(eventResult(e,'red').points,1); // tied 2nd: share 3+0
});
test('Betrayal all-betray round earns zero and no win for every color',async()=>{
 const {eventResult}=await import('../src/scoring.js');
 const e={scoring_mode:'betrayal',point_rounds:[{name:'Round 1',scores:{red:0,blue:0,green:0}}]};
 for(const t of teams){assert.equal(eventResult(e,t.id).points,0);assert.equal(eventResult(e,t.id).win,false);assert.equal(eventResult(e,t.id).label,'Draw');}
});
test('Betrayal validates payoff values and six-round maximum and keeps maximum award bounded',async()=>{
 const {validateBetrayalRounds,eventResult}=await import('../src/scoring.js');
 const rounds=Array.from({length:6},(_,i)=>({name:'Round '+(i+1),scores:{red:5,blue:2,green:0}}));
 assert.ok(validateBetrayalRounds(rounds,teams));
 assert.equal(eventResult({scoring_mode:'betrayal',point_rounds:rounds},'red').rawPoints,30);
 assert.equal(eventResult({scoring_mode:'betrayal',point_rounds:rounds},'red').points,6);
 assert.equal(validateBetrayalRounds([...rounds,rounds[0]],teams),false);
 assert.equal(validateBetrayalRounds([{name:'Invalid',scores:{red:3,blue:0,green:0}}],teams),false);
});

test('heats pool matching places so the event pays the same as a ranked event', async () => {
 const {heatPlacePoints,heatResults,eventResult,validateHeats,rankedPoints,hasResult} = await import('../src/scoring.js');
 assert.deepEqual(heatPlacePoints([3,3]), [8,3,0]);
 const total = sizes => {const a=heatPlacePoints(sizes);return sizes.reduce((n,k)=>n+a.slice(0,k).reduce((x,y)=>x+y,0),0)};
 assert.equal(total([3,3]), rankedPoints(6).reduce((a,b)=>a+b));
 for (const s of [[2,2,2],[4,2],[3,2],[4,4],[3,3,2]]) assert.ok(total(s) <= rankedPoints(s.reduce((a,b)=>a+b)).reduce((a,b)=>a+b));
 const heats=[{name:'Heat 1',order:['a','b','c']},{name:'Heat 2',order:['d','e','f']}];
 const r=heatResults(heats);
 assert.equal(r.a.points, r.d.points); assert.equal(r.b.points, r.e.points); assert.equal(r.c.points, r.f.points);
 const event={scoring_mode:'heats',point_rounds:heats};
 assert.ok(hasResult(event));
 assert.deepEqual(eventResult(event,'d'), {label:'1st · Heat 2',points:8,played:true,win:true,heat:1});
 const teams=['a','b','c','d','e','f'].map(id=>({id}));
 assert.ok(validateHeats(heats,teams));
 assert.ok(!validateHeats([{name:'Heat 1',order:['a','b','c']},{name:'Heat 2',order:['d','e']}],teams));
 assert.ok(!validateHeats([{name:'Heat 1',order:['a','b','c','d']},{name:'Heat 2',order:['d','e','f']}],teams));
 assert.ok(!validateHeats([{name:'Heat 1',order:['a','b','c','d','e']},{name:'Heat 2',order:['f']}],teams));
});

test('Boom Cup: every winner earns points, only the loser loses points, net payout matches a ranked event', async () => {
 const {eventResult,hasResult,rankedPoints,loserPoints} = await import('../src/scoring.js');
 const ids=['a','b','c','d','e','f'],e={scoring_mode:'loser',placements:ids};
 assert.ok(hasResult(e));
 assert.deepEqual(eventResult(e,'f'),{label:'Loser',points:-3,played:true,win:false});
 assert.deepEqual(eventResult(e,'a'),{label:'Winner',points:5,played:true,win:true});
 for (let n=2;n<=12;n++){const a=loserPoints(n);assert.ok(a.winner>0&&a.loser<0);assert.equal((n-1)*a.winner+a.loser,rankedPoints(n).reduce((x,y)=>x+y))}
});
test('manual overrides replace an event award and total adjustments shift the leaderboard', async () => {
 const {eventResult,validateOverrides} = await import('../src/scoring.js');
 const e={placements:['red','blue','green'],point_overrides:{blue:10}};
 assert.equal(eventResult(e,'red').points,6);
 assert.deepEqual(eventResult(e,'blue'),{label:'2nd',points:10,played:true,win:false,calculated:3,manual:true});
 const rows=standings(teams.map(t=>t.id==='green'?{...t,points_adjustment:-2}:t),[e]);
 assert.deepEqual(rows.map(t=>[t.id,t.total]),[['blue',10],['red',6],['green',-2]]);
 assert.equal(eventResult({placements:[],point_overrides:{blue:10}},'blue'),null);
 assert.ok(validateOverrides({red:0,blue:-5},teams));
 assert.ok(!validateOverrides({red:1.5},teams)); assert.ok(!validateOverrides({pink:1},teams));
});
test('Betrayal ties never pay out more than a ranked event', async () => {
 const {tallyAwards,rankedPoints} = await import('../src/scoring.js');
 const max=rankedPoints(6).reduce((x,y)=>x+y);
 for (const v of [[5,5,5,0,0,0],[2,2,2,2,2,2],[5,0,2,2,5,0],[5,2,2,0,5,2]]) {const a=tallyAwards(v);assert.ok(v.reduce((n,x)=>n+(x===0?0:a[x]),0)<=max)}
});
test('schedule starts at 2 PM and runs the games back to back', async () => {
 const {buildSchedule} = await import('../src/schedule.js');
 const rows = buildSchedule(['Arms, Shuff & Pool',"King's Cup",'Bodies','Betrayal','Boom Cup','Beerio Kart','Beer Pong'].map(name=>({name})));
 assert.equal(rows[0].time,'2:00 PM'); assert.equal(rows[1].name,'Arms, Shuff & Pool'); assert.equal(rows[1].time,'2:30 PM'); assert.equal(rows[2].time,'3:25 PM');
 assert.equal(rows.at(-2).name,'Beer Pong'); assert.equal(rows.length,9); assert.ok(!rows.some(r=>/break/i.test(r.name)));
});
test('matchup editor renders a draft and applies winner taps', async () => {
 const m = await import('../src/matchups.js');
 const teams=['a','b','c','d','e','f'].map(id=>({id,name:id.toUpperCase(),color:'#112233'})),event={scoring_mode:'matchups',point_rounds:[]};
 const ui={teams,busy:false,escape:x=>String(x??''),dot:()=>'',button:(t,a,e='')=>`<button data-action="${a}" ${e}>${t}</button>`,event};
 m.loadMatchDraft(event,teams);
 assert.match(m.matchEditor(ui),/Arms Up[\s\S]*Shuffleboard[\s\S]*Pool/);
 assert.deepEqual(m.getMatchDraft(),[]);
 m.matchChange({dataset:{r:'0',m:'0',matchTeam:'a'},value:'a'}); m.matchChange({dataset:{r:'0',m:'0',matchTeam:'b'},value:'b'});
 assert.ok(m.matchClick('match-win',{r:'0',m:'0',id:'b'}));
 assert.deepEqual(m.getMatchDraft(),[{name:'Round 1',matches:[{game:'Arms Up',a:'a',b:'b',winner:'b'}]}]);
 assert.match(m.matchEditor(ui),/B: <strong>1–0 · \d+ pts/);
 m.matchChange({dataset:{r:'0',m:'0',matchTeam:'b'},value:'c'});
 assert.equal(m.getMatchDraft()[0].matches[0].winner,null);
 assert.ok(m.matchClick('match-add-round',{})); assert.match(m.matchEditor(ui),/Round 2/);
 assert.match(m.matchSummary({point_rounds:[{name:'Round 1',matches:[{game:'Pool',a:'a',b:'b',winner:'b'}]}]},teams,ui.escape),/Pool: <strong>B<\/strong> beat A/);
});
