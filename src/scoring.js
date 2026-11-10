// First place receives a larger step than the remaining ranked places.
export function rankedPoints(count){
 if(count<2)return [0];
 if(count===2)return [4,0];
 if(count===3)return [6,3,0];
 return [count+3,count,count-2,...Array.from({length:count-3},(_,i)=>count-4-i)];
}
export const SIDE_POINTS = {win:3,loss:0,draw:0};
export const ordinal = n => `${n}${n%100>=11&&n%100<=13?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th')}`;
export const isSideEvent = event => event.scoring_mode==='sides';
export const isPointsEvent = event => event.scoring_mode==='points';
export const isTallyEvent = event => event.scoring_mode==='betrayal';
export const isLoserEvent = event => event.scoring_mode==='loser';
export const isMatchEvent = event => event.scoring_mode==='matchups';
export const isHeatEvent = event => event.scoring_mode==='heats';
export const isRoundEvent = event => isPointsEvent(event)||isTallyEvent(event);
export const pointTotals = event => Object.fromEntries(Object.keys(event.point_rounds?.[0]?.scores||{}).map(id=>[id,event.point_rounds.reduce((sum,r)=>sum+r.scores[id],0)]));
export const hasResult = event => isMatchEvent(event)?(event.point_rounds||[]).some(r=>(r.matches||[]).some(m=>m.winner)):isRoundEvent(event)||isHeatEvent(event)?!!event.point_rounds?.length:isSideEvent(event)?['a','b','draw'].includes(event.winner):!!event.placements?.length;
// Organizer overrides: event.point_overrides = {teamId: points} replaces the calculated award.
export const hasOverride = (event,teamId) => Number.isInteger(event.point_overrides?.[teamId]);
export function eventResult(event,teamId){
 const r=calculatedResult(event,teamId);
 return r&&hasOverride(event,teamId)?{...r,points:event.point_overrides[teamId],calculated:r.points,manual:true}:r;
}
export function calculatedResult(event,teamId){
 if(!hasResult(event))return null;
 if(isMatchEvent(event)){
  const rec=matchRecords(event.point_rounds),r=rec[teamId];
  if(!r)return {label:'Did not play',points:0,played:false,win:false};
  const diffs=Object.values(rec).map(x=>x.wins-x.losses),diff=r.wins-r.losses,rank=1+diffs.filter(d=>d>diff).length,tied=diffs.filter(d=>d===diff).length>1;
  return {label:`${tied?'Tied ':''}${ordinal(rank)} · ${r.wins}–${r.losses}`,points:tallyAwards(diffs)[diff],played:true,win:rank===1&&r.wins>0};
 }
 if(isLoserEvent(event)){
  // placements = every team, with the single loser last; all others tie as winners.
  const i=event.placements.indexOf(teamId),n=event.placements.length;
  if(i<0)return {label:'Did not play',points:0,played:false,win:false};
  const lost=i===n-1;
  const award=loserPoints(n);
  return {label:lost?'Loser':'Winner',points:lost?award.loser:award.winner,played:true,win:!lost};
 }
 if(isHeatEvent(event)){
  const r=heatResults(event.point_rounds)[teamId];
  if(!r)return {label:'Did not play',points:0,played:false,win:false};
  return {label:`${ordinal(r.place)} · ${r.heatName}`,points:r.points,played:true,win:r.place===1,heat:r.heat};
 }
 if(isRoundEvent(event)){
  const totals=pointTotals(event),points=totals[teamId];
  if(points===undefined)return {label:'Did not play',points:0,played:false,win:false};
  const values=Object.values(totals),rank=1+values.filter(p=>p>points).length,tied=values.filter(p=>p===points).length>1;
  const award=isTallyEvent(event)?(points===0?0:tallyAwards(values)[points]):points;
  return {label:isTallyEvent(event)&&Math.max(...values)===0?'Draw':(tied?'Tied ':'')+ordinal(rank),points:award,rawPoints:isTallyEvent(event)?points:undefined,played:true,win:rank===1&&points>0};
 }
 if(isSideEvent(event)){
  const side=(event.side_a||[]).includes(teamId)?'a':(event.side_b||[]).includes(teamId)?'b':null;
  if(!side)return {label:'Did not play',points:0,played:false,win:false};
  const draw=event.winner==='draw',win=event.winner===side;
  return {label:draw?'Draw':win?'Win':'Loss',points:draw?SIDE_POINTS.draw:win?SIDE_POINTS.win:SIDE_POINTS.loss,played:true,win,side};
 }
 const i=event.placements.indexOf(teamId);
 return i<0?{label:'Did not play',points:0,played:false,win:false}:{label:ordinal(i+1),points:rankedPoints(event.placements.length)[i]||0,played:true,win:i===0};
}
export function standings(teams,events){
 const rows=teams.map(t=>{
  const results=events.map(e=>eventResult(e,t.id)).filter(Boolean);
  return {...t,total:results.reduce((sum,r)=>sum+r.points,0)+(t.points_adjustment||0),wins:results.filter(r=>r.win).length,played:results.filter(r=>r.played).length};
 }).sort((a,b)=>b.total-a.total||a.sort_order-b.sort_order);
 return rows.map((t,i)=>({...t,rank:i&&t.total===rows[i-1].total?rows.findIndex(x=>x.total===t.total)+1:i+1}));
}
export const validateOverrides = (values,teams) => Object.entries(values).every(([id,v])=>teams.some(t=>t.id===id)&&Number.isInteger(v)&&v>=-999&&v<=999);
export function validateOrder(order,teams){return order.length===teams.length && new Set(order).size===teams.length && order.every(id=>teams.some(t=>t.id===id));}
export function validateSides(sideA,sideB,winner,teams){
 const ids=[...sideA,...sideB];
 return sideA.length>0&&sideB.length>0&&['a','b','draw'].includes(winner)&&new Set(ids).size===ids.length&&ids.every(id=>teams.some(t=>t.id===id));
}

export function validatePointRounds(rounds,teams){
 return Array.isArray(rounds)&&rounds.length>0&&rounds.length<=20&&rounds.every(r=>
  typeof r.name==='string'&&r.name.trim().length>0&&r.name.length<=60&&r.scores&&
  Object.keys(r.scores).length===teams.length&&teams.every(t=>Number.isInteger(r.scores[t.id])&&r.scores[t.id]>=0&&r.scores[t.id]<=999));
}

export function validateBetrayalRounds(rounds,teams){return validatePointRounds(rounds,teams)&&rounds.length<=6&&rounds.every(r=>Object.values(r.scores).every(p=>[0,2,5].includes(p)));}

// Heats: teams are split into separate races. Matching finishes across heats share the
// same award, pooled from the normal ranked table for every team that raced, so the
// event pays out the same total as any other ranked event.
// Pool the normal ranked table across tied groups (best group first). Each team in a group
// gets an equal whole-number share; the event never pays out more than a normal ranked event.
export function pooledAwards(groupSizes){
 const table=rankedPoints(groupSizes.reduce((a,b)=>a+b,0));let slot=0;
 const groups=groupSizes.map(size=>{const sum=table.slice(slot,slot+size).reduce((a,b)=>a+b,0);slot+=size;return {size,points:Math.floor(sum/size),rem:sum%size}});
 let left=table.reduce((a,b)=>a+b,0)-groups.reduce((n,g)=>n+g.size*g.points,0);
 // Hand rounding leftovers to the highest places first, never letting a lower place pass a higher one.
 for(let i=0;i<groups.length&&left>0;i++){const g=groups[i];if(g.rem>0&&g.size<=left&&(i===0||g.points+1<=groups[i-1].points)){g.points++;left-=g.size}}
 return groups.map(g=>g.points);
}
// Heats: matching finishes across heats form one tied group.
export function heatPlacePoints(heatSizes){
 const sizes=heatSizes.filter(n=>n>0),longest=Math.max(0,...sizes);
 return pooledAwards(Array.from({length:longest},(_,p)=>sizes.filter(n=>n>p).length));
}
// One-loser games: every winner earns the same positive award and the loser is docked points,
// sized so the event's net payout equals a normal ranked event (six teams: +5 each, -3).
export function loserPoints(n){
 if(n<2)return {winner:0,loser:0};
 const total=rankedPoints(n).reduce((a,b)=>a+b,0),winner=Math.ceil((total+1)/(n-1));
 return {winner,loser:total-(n-1)*winner};
}
// Betrayal: equal tallies share the pooled points for the places they cover. Returns {tally: award}.
export function tallyAwards(values){
 const distinct=[...new Set(values)].sort((a,b)=>b-a),award=pooledAwards(distinct.map(v=>values.filter(x=>x===v).length));
 return Object.fromEntries(distinct.map((v,i)=>[v,award[i]]));
}
export function heatResults(heats=[]){
 const award=heatPlacePoints(heats.map(h=>h.order?.length||0)),out={};
 heats.forEach((h,heat)=>(h.order||[]).forEach((id,i)=>{out[id]={place:i+1,heat,heatName:h.name,points:award[i]}}));
 return out;
}
export function validateHeats(heats,teams){
 if(!Array.isArray(heats)||heats.length<1||heats.length>6)return false;
 const ids=heats.flatMap(h=>h.order||[]);
 return heats.every(h=>typeof h.name==='string'&&h.name.trim().length>0&&h.name.length<=60&&Array.isArray(h.order)&&h.order.length>=2)&&
  ids.length===teams.length&&new Set(ids).size===ids.length&&ids.every(id=>teams.some(t=>t.id===id));
}

// Matchups: rounds of head-to-head games. point_rounds = [{name, matches:[{game,a,b,winner}]}].
// Teams are ranked by win-loss record; equal records share pooled placement points.
export function matchRecords(rounds=[]){
 const rec={};
 for(const r of rounds)for(const m of r.matches||[]){
  for(const id of [m.a,m.b])if(id)rec[id]??={wins:0,losses:0};
  if(m.winner&&m.a&&m.b&&(m.winner===m.a||m.winner===m.b)){rec[m.winner].wins++;rec[m.winner===m.a?m.b:m.a].losses++}
 }
 return rec;
}
export function validateMatchups(rounds,teams){
 const known=id=>teams.some(t=>t.id===id);
 return Array.isArray(rounds)&&rounds.length>=1&&rounds.length<=10&&rounds.every(r=>{
  if(typeof r.name!=='string'||!r.name.trim()||r.name.length>60||!Array.isArray(r.matches)||r.matches.length<1||r.matches.length>12)return false;
  const ids=r.matches.flatMap(m=>[m.a,m.b]);
  return new Set(ids).size===ids.length&&r.matches.every(m=>typeof m.game==='string'&&m.game.length<=40&&known(m.a)&&known(m.b)&&(m.winner===null||m.winner===m.a||m.winner===m.b));
 });
}
