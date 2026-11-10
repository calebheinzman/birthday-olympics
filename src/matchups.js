// Score desk editor for matchup games: enter who played whom each round and tap the winner.
// Draft shape matches events.point_rounds: [{name, matches:[{game, a, b, winner}]}].
import {matchRecords, eventResult} from './scoring.js';

const STATIONS = ['Arms Up', 'Shuffleboard', 'Pool'];
let rounds = [];

const blankRound = (n, games) => ({name: 'Round ' + n, matches: games.map(game => ({game, a: '', b: '', winner: null}))});
const defaultGames = teams => Array.from({length: Math.max(1, Math.floor(teams.length / 2))}, (_, i) => STATIONS[i] || 'Game ' + (i + 1));

export function loadMatchDraft(event, teams) {
  rounds = event.point_rounds?.length && event.point_rounds[0].matches ? structuredClone(event.point_rounds) : [blankRound(1, defaultGames(teams))];
}
// Empty matchups (no teams chosen) are dropped on save; winners stay null until picked.
export const getMatchDraft = () => rounds.map(r => ({name: r.name, matches: r.matches.filter(m => m.a || m.b).map(m => ({game: m.game.trim(), a: m.a, b: m.b, winner: m.winner || null}))})).filter(r => r.matches.length);

export function matchEditor({teams, busy, escape, dot, button, event}) {
  const off = busy ? 'disabled' : '', name = id => escape(teams.find(t => t.id === id)?.name || 'Team');
  const teamSelect = (r, m, side, round) => {
    const match = round.matches[m], taken = round.matches.flatMap((x, i) => i === m ? [side === 'a' ? x.b : x.a] : [x.a, x.b]);
    return `<select data-match-team="${side}" data-r="${r}" data-m="${m}" aria-label="Team ${side.toUpperCase()}" ${off}><option value="">Choose team</option>${teams.map(t => `<option value="${t.id}" ${match[side] === t.id ? 'selected' : ''} ${taken.includes(t.id) ? 'disabled' : ''}>${escape(t.name)}</option>`).join('')}</select>`;
  };
  const draft = {...event, point_rounds: getMatchDraft()}, rec = matchRecords(draft.point_rounds);
  const table = teams.filter(t => rec[t.id]).map(t => ({t, r: eventResult(draft, t.id) || {points: 0}})).sort((x, y) => y.r.points - x.r.points || rec[y.t.id].wins - rec[x.t.id].wins);
  return `<p>Set who plays whom in each round, then tap the winner of each matchup. Points are worked out from each team’s win–loss record: the best record takes first place, and equal records share a place and its points. You can save the matchups first and add winners as games finish.</p>
<div class="point-rounds match-rounds">${rounds.map((round, r) => `<fieldset class="point-round"><legend>Round ${r + 1}</legend><label>Round name<input data-match-round="${r}" maxlength="60" value="${escape(round.name)}" ${off}></label>
${round.matches.map((m, i) => `<div class="match-row"><input data-match-game data-r="${r}" data-m="${i}" maxlength="40" placeholder="Game" aria-label="Game" value="${escape(m.game)}" ${off}>
<div class="match-teams">${teamSelect(r, i, 'a', round)}<span>vs</span>${teamSelect(r, i, 'b', round)}</div>
${m.a && m.b ? `<div class="match-winner"><span>Winner</span>${[m.a, m.b].map(id => `<button type="button" data-action="match-win" data-r="${r}" data-m="${i}" data-id="${id}" aria-pressed="${m.winner === id}" ${off}>${dot(teams.find(t => t.id === id))}${name(id)}</button>`).join('')}</div>` : ''}
${button('Remove matchup', 'match-remove', `class="danger-text" data-r="${r}" data-m="${i}" ${off}`)}</div>`).join('')}
<div class="inline-actions">${button('+ Add matchup', 'match-add', `data-r="${r}" ${round.matches.length >= 12 || busy ? 'disabled' : ''}`)}${rounds.length > 1 ? button('Remove round', 'match-remove-round', `class="danger-text" data-r="${r}" ${off}`) : ''}</div></fieldset>`).join('')}</div>
${button('+ Add a round', 'match-add-round', rounds.length >= 10 || busy ? 'disabled' : '')}
<div class="points-preview" aria-live="polite"><h3>Standings from these results</h3>${table.length ? table.map(({t, r}) => `<span>${dot(t)}${escape(t.name)}: <strong>${rec[t.id].wins}–${rec[t.id].losses} · ${r.points} pts</strong></span>`).join('') : '<span>Pick teams to see the standings.</span>'}</div>`;
}

// Returns true when the draft changed.
export function matchClick(action, data) {
  const r = Number(data.r), m = Number(data.m);
  if (action === 'match-win') { const x = rounds[r].matches[m]; x.winner = x.winner === data.id ? null : data.id }
  else if (action === 'match-add') rounds[r].matches.push({game: '', a: '', b: '', winner: null});
  else if (action === 'match-remove') rounds[r].matches.splice(m, 1);
  else if (action === 'match-add-round') rounds.push(blankRound(rounds.length + 1, rounds.at(-1).matches.map(x => x.game)));
  else if (action === 'match-remove-round') rounds.splice(r, 1);
  else return false;
  return true;
}
export function matchChange(el) {
  const x = rounds[Number(el.dataset.r)].matches[Number(el.dataset.m)];
  x[el.dataset.matchTeam] = el.value;
  if (x.winner !== x.a && x.winner !== x.b) x.winner = null;
}
export function matchInput(el) {
  if (el.matches('[data-match-round]')) rounds[Number(el.dataset.matchRound)].name = el.value;
  else rounds[Number(el.dataset.r)].matches[Number(el.dataset.m)].game = el.value;
}
export function matchSummary(event, teams, escape) {
  const name = id => escape(teams.find(t => t.id === id)?.name || 'Team');
  return event.point_rounds.map(r => `<h3>${escape(r.name)}</h3>${r.matches.map(m => `<p>${m.game ? escape(m.game) + ': ' : ''}${m.winner ? `<strong>${name(m.winner)}</strong> beat ${name(m.winner === m.a ? m.b : m.a)}` : `${name(m.a)} vs ${name(m.b)} · not played yet`}</p>`).join('')}`).join('');
}
