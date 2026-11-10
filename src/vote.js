// Live voting for Bodies. Guests pick their team color and a name; the organizer runs the timer.
// All reads and votes go through database functions, so results stay hidden until released.
import {store, deviceId as voterId, getProfile} from './device.js';

let ctx, state = null, offset = 0, error = '', sending = false;
let pick = '', secondsDraft = '', historyOpen = false;
let myTeam = store.get('vote-team') || '';
let cast = JSON.parse(store.get('vote-cast') || 'null'); // {round, candidate}

const serverNow = () => Date.now() + offset;
const secondsLeft = () => !state ? 0 : state.status === 'paused' ? state.remaining
  : state.status === 'open' ? Math.max(0, Math.ceil((new Date(state.ends_at).getTime() - serverNow()) / 1000)) : 0;
// "open" with no time left is treated as closed everywhere.
const phase = () => !state ? 'loading' : state.status === 'open' && secondsLeft() <= 0 ? 'closed' : state.status;
const clock = () => { const s = secondsLeft(); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` };
const dot = t => `<span class="dot" style="--team:${/^#[0-9a-f]{6}$/i.test(t?.color) ? t.color : '#888'}" aria-hidden="true"></span>`;
const btn = (text, action, extra = '') => `<button type="button" data-vote="${action}" ${extra}>${text}</button>`;
// This phone's sign-up (from the Join page), if it is still on the list.
const me = () => { const p = getProfile(); return p && state?.candidates.find(c => c.id === p.id) || null };
const voteTeam = () => me()?.team_id || myTeam;
const myCast = () => cast && state && cast.round === state.round ? cast.candidate : '';

function resultsHtml(live) {
  const { escape, getTeams } = ctx, rows = state.results || [];
  const tally = state.candidates.map(c => ({ ...c, votes: rows.filter(r => r.candidate_id === c.id) }))
    .map(c => ({ ...c, n: c.votes.reduce((a, r) => a + r.n, 0) })).sort((a, b) => b.n - a.n);
  const top = tally[0]?.n || 0, tied = top > 0 && tally.filter(c => c.n === top).length > 1;
  const turnout = live ? '' : `<div class="vote-turnout"><h3>Votes cast by team</h3><div class="vote-dots">${getTeams().map(t => `<span>${dot(t)}${escape(t.name)}: <strong>${rows.filter(r => r.team_id === t.id).reduce((a, r) => a + r.n, 0)}</strong></span>`).join('')}</div></div>`;
  return `<div class="vote-results">${live ? '' : `<p class="vote-verdict">${!top ? 'No votes were cast.' : tied ? 'It’s a tie — vote again.' : `${escape(tally[0].name)} has the most votes.`}</p>`}${tally.map(c => `<div class="vote-bar ${!live && top && c.n === top ? 'top' : ''}"><div class="vote-bar-head"><strong>${escape(c.name)}</strong><b>${c.n} ${c.n === 1 ? 'vote' : 'votes'}</b></div><div class="vote-track"><i style="width:${top ? Math.round(c.n / top * 100) : 0}%"></i></div><div class="vote-dots">${c.votes.map(r => { const t = getTeams().find(x => x.id === r.team_id); return `<span>${dot(t)}${escape(t?.name || 'Team')}${r.n > 1 ? ' ×' + r.n : ''}</span>` }).join('')}</div></div>`).join('')}${turnout}</div>`;
}

// Organizer-only record of every released vote, plus each team's running totals.
function historyHtml() {
  const { escape, getTeams } = ctx, rows = state.history || [], rounds = [...new Set(rows.map(r => r.round))];
  if (!rows.length) return '<p class="fineprint">No votes released yet. Each vote is saved here when you release its results.</p>';
  const picks = list => { const by = {}; list.forEach(r => by[r.name] = (by[r.name] || 0) + r.n); return Object.entries(by).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${escape(n)} ×${c}`).join(', ') };
  const block = (title, list) => `<h3>${title}</h3>${getTeams().map(t => { const mine = list.filter(r => r.team_id === t.id); return `<p>${dot(t)}${escape(t.name)} <span class="muted">(${mine.reduce((a, r) => a + r.n, 0)} votes)</span>: <strong>${picks(mine) || 'no votes'}</strong></p>` }).join('')}`;
  return `${block('All votes so far', rows)}${rounds.map((round, i) => block('Vote ' + (i + 1), rows.filter(r => r.round === round))).join('')}${btn('Clear history', 'clear_history', 'class="danger-text"')}`;
}

function controls() {
  const { escape } = ctx, p = phase(), running = p === 'open', has = state.candidates.length > 1;
  return `<section class="panel vote-desk"><div class="section-heading"><div><div class="eyebrow">ORGANIZER ONLY</div><h2>Voting controls</h2></div><span class="status-pill">${{ idle: 'Not started', open: 'Voting open', paused: 'Paused', closed: 'Time’s up', released: 'Results released' }[p]}</span></div>
<label>Seconds to vote<input type="number" min="5" max="600" step="5" inputmode="numeric" data-vote-seconds value="${escape(secondsDraft || state.duration)}"></label>
<div class="inline-actions">${btn(p === 'idle' ? 'Start voting ↗' : 'Start a new vote ↗', 'start', `class="primary" ${has && !running ? '' : 'disabled'}`)}${p === 'paused' ? btn('Resume', 'resume') : btn('Pause', 'pause', running ? '' : 'disabled')}${btn('Release results', 'release', p === 'idle' || p === 'released' ? 'disabled' : '')}${btn('Reset', 'reset', `class="danger-text" ${p === 'idle' && !state.total ? 'disabled' : ''}`)}</div>
${has ? '' : '<p class="fineprint">At least two people need to be signed up before you can start.</p>'}
<p><strong>${state.candidates.length} ${state.candidates.length === 1 ? 'person is' : 'people are'} on the ballot.</strong> The ballot is everyone on the sign-up list. <a class="text-link" href="#join">Add, edit or remove people ↗</a></p>
${p === 'idle' ? '' : `<details class="round-results"><summary>Live count · only you can see this <span>+</span></summary>${resultsHtml(true)}</details>`}
<details class="round-results vote-history" ${historyOpen ? 'open' : ''}><summary>Vote history · who each team voted for <span>+</span></summary>${historyHtml()}</details></section>`;
}

function ballot() {
  const { escape, getTeams } = ctx, p = phase(), open = p === 'open', voted = myCast(), signedUp = me(), teamOf = c => getTeams().find(t => t.id === c.team_id);
  const votedName = state.candidates.find(c => c.id === voted)?.name;
  if (p === 'idle') return `<section class="panel vote-wait"><h2>Voting isn’t open yet.</h2><p>Keep this page open. The ballot appears as soon as the organizer starts a vote.</p></section>`;
  if (p === 'released') return `<section class="panel"><div class="eyebrow">THE RESULTS</div><h2>${state.total} ${state.total === 1 ? 'vote' : 'votes'} counted</h2>${resultsHtml(false)}</section>`;
  if (p === 'closed') return `<section class="panel vote-wait"><h2>Time’s up.</h2><p>${state.total} ${state.total === 1 ? 'vote is' : 'votes are'} in. Waiting for the organizer to release the results.</p>${votedName ? `<p>You voted for <strong>${escape(votedName)}</strong>.</p>` : ''}</section>`;
  return `<section class="panel vote-ballot"><div class="vote-clock ${open ? '' : 'paused'}"><span>${open ? 'TIME LEFT' : 'PAUSED'}</span><strong id="vote-clock">${clock()}</strong><small>${state.total} ${state.total === 1 ? 'vote' : 'votes'} in</small></div>
${signedUp?.team_id ? `<p class="vote-as">Voting as <strong>${escape(signedUp.name)}</strong> · ${dot(teamOf(signedUp))}${escape(teamOf(signedUp)?.name || 'Team')} <a class="text-link" href="#join">Not you?</a></p>`
    : `<h3>Your team color</h3><div class="vote-options">${getTeams().map(t => `<button type="button" data-vote="team" data-id="${t.id}" aria-pressed="${myTeam === t.id}" ${open ? '' : 'disabled'}>${dot(t)}${escape(t.name)}</button>`).join('')}</div><p class="fineprint"><a class="text-link" href="#join">Sign up</a> once and your team is remembered.</p>`}
<h3>Your vote</h3><div class="vote-options">${state.candidates.map(c => `<button type="button" data-vote="pick" data-id="${c.id}" aria-pressed="${(pick || voted) === c.id}" ${open ? '' : 'disabled'}>${c.team_id ? dot(teamOf(c)) : ''}${escape(c.name)}</button>`).join('')}</div>
${btn(voted ? 'Change my vote ↗' : 'Cast my vote ↗', 'cast', `class="primary" ${open && !sending ? '' : 'disabled'}`)}
<p class="vote-note" role="status">${votedName ? `Your vote is in for <strong>${escape(votedName)}</strong>. You can change it until time runs out.` : open ? (signedUp?.team_id ? 'Pick a name, then cast your vote.' : 'Pick your team color and a name, then cast your vote.') : 'Voting is paused. Hang tight.'}</p></section>`;
}

export function votePage() {
  const body = !state ? `<section class="panel narrow"><h2>${error ? 'Couldn’t load voting' : 'Opening the ballot box…'}</h2><p>${ctx.escape(error)}</p></section>`
    : `${ctx.admin() ? controls() : ''}${ballot()}`;
  return `<div id="vote-root"><section class="page-intro"><div class="eyebrow">BODIES · THE VOTE</div><h1>WHO’S THE<br><em>KILLER?</em></h1></section>${body}</div>`;
}

function paint(force) {
  const root = document.querySelector('#vote-root');
  if (!root) return;
  // Don't yank an input out from under someone who is typing.
  if (!force && root.contains(document.activeElement) && document.activeElement.matches('input')) return;
  root.outerHTML = votePage();
}

async function load(force) {
  if (ctx.route() !== 'vote') return;
  const before = performance.now(), { data, error: e } = await ctx.db.rpc('vote_state');
  if (e) { error = e.message; if (!state) paint(true); return }
  const next = JSON.stringify({ ...data, now: 0 }), prev = state && JSON.stringify({ ...state, now: 0 });
  offset = new Date(data.now).getTime() + (performance.now() - before) / 2 - Date.now();
  state = data; error = '';
  if (pick && !state.candidates.some(c => c.id === pick)) pick = '';
  if (force || next !== prev) paint(force);
}

async function act(action, id) {
  const { db, toast, getTeams } = ctx;
  if (action === 'team') { myTeam = id; store.set('vote-team', id); return paint(true) }
  if (action === 'pick') { pick = id; return paint(true) }
  if (action === 'cast') {
    const choice = pick || myCast();
    if (!getTeams().some(t => t.id === voteTeam())) return toast('Pick your team color first.');
    if (!choice) return toast('Pick who you’re voting for.');
    sending = true; paint(true);
    const { error: e } = await db.rpc('cast_vote', { p_voter: voterId, p_team: voteTeam(), p_candidate: choice, p_round: state.round });
    sending = false;
    if (e) toast(e.message); else { cast = { round: state.round, candidate: choice }; store.set('vote-cast', JSON.stringify(cast)); pick = ''; toast('Vote recorded.') }
    return load(true);
  }
  if (!ctx.admin()) return;
  let e;
  {
    if (action === 'reset' && !confirm('Reset voting? All votes from this round are deleted.')) return;
    if (action === 'clear_history' && !confirm('Clear the vote history? This cannot be undone.')) return;
    const seconds = Number(secondsDraft || state.duration);
    if (action === 'start' && !(Number.isInteger(seconds) && seconds >= 5 && seconds <= 600)) return toast('Choose between 5 and 600 seconds.');
    ({ error: e } = await db.rpc('vote_control', { p_action: action, p_seconds: seconds }));
  }
  if (e) toast(e.message);
  await load(true);
}

export function initVote(context) {
  ctx = context;
  ctx.app.addEventListener('click', ev => { const b = ev.target.closest('[data-vote]'); if (b && !b.disabled) act(b.dataset.vote, b.dataset.id) });
  // Remember whether the history panel is open so repaints don't snap it shut.
  ctx.app.addEventListener('toggle', ev => { if (ev.target.matches?.('.vote-history')) historyOpen = ev.target.open }, true);
  ctx.app.addEventListener('input', ev => {
    if (ev.target.matches('[data-vote-seconds]')) secondsDraft = ev.target.value;
  });
  window.addEventListener('hashchange', () => load(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load() });
  setInterval(() => { if (!document.hidden) load() }, 1500);
  // Tick the clock locally; repaint once when the timer runs out.
  let last = '';
  setInterval(() => {
    if (ctx.route() !== 'vote' || !state) return;
    const el = document.querySelector('#vote-clock'), p = phase();
    if (el && el.textContent !== clock()) el.textContent = clock();
    if (p !== last) { if (last) paint(true); last = p }
  }, 250);
  load(true);
}
