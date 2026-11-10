// Live voting for Bodies. Guests pick their team color and a name; the organizer runs the timer.
// All reads and votes go through database functions, so results stay hidden until released.
let ctx, state = null, offset = 0, error = '', sending = false;
let pick = '', nameDraft = '', secondsDraft = '';
const store = {
  get(k) { try { return localStorage.getItem(k) } catch { return null } },
  set(k, v) { try { localStorage.setItem(k, v) } catch { /* private window: keep in memory only */ } },
};
let voterId = store.get('vote-voter') || crypto.randomUUID();
store.set('vote-voter', voterId);
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
const myCast = () => cast && state && cast.round === state.round ? cast.candidate : '';

function resultsHtml(live) {
  const { escape, getTeams } = ctx, rows = state.results || [];
  const tally = state.candidates.map(c => ({ ...c, votes: rows.filter(r => r.candidate_id === c.id) }))
    .map(c => ({ ...c, n: c.votes.reduce((a, r) => a + r.n, 0) })).sort((a, b) => b.n - a.n);
  const top = tally[0]?.n || 0, tied = top > 0 && tally.filter(c => c.n === top).length > 1;
  return `<div class="vote-results">${live ? '' : `<p class="vote-verdict">${!top ? 'No votes were cast.' : tied ? 'It’s a tie — vote again.' : `${escape(tally[0].name)} has the most votes.`}</p>`}${tally.map(c => `<div class="vote-bar ${!live && top && c.n === top ? 'top' : ''}"><div class="vote-bar-head"><strong>${escape(c.name)}</strong><b>${c.n} ${c.n === 1 ? 'vote' : 'votes'}</b></div><div class="vote-track"><i style="width:${top ? Math.round(c.n / top * 100) : 0}%"></i></div><div class="vote-dots">${c.votes.map(r => { const t = getTeams().find(x => x.id === r.team_id); return `<span>${dot(t)}${escape(t?.name || 'Team')}${r.n > 1 ? ' ×' + r.n : ''}</span>` }).join('')}</div></div>`).join('')}</div>`;
}

function controls() {
  const { escape } = ctx, p = phase(), running = p === 'open', has = state.candidates.length > 1;
  return `<section class="panel vote-desk"><div class="section-heading"><div><div class="eyebrow">ORGANIZER ONLY</div><h2>Voting controls</h2></div><span class="status-pill">${{ idle: 'Not started', open: 'Voting open', paused: 'Paused', closed: 'Time’s up', released: 'Results released' }[p]}</span></div>
<label>Seconds to vote<input type="number" min="5" max="600" step="5" inputmode="numeric" data-vote-seconds value="${escape(secondsDraft || state.duration)}"></label>
<div class="inline-actions">${btn(p === 'idle' ? 'Start voting ↗' : 'Start a new vote ↗', 'start', `class="primary" ${has && !running ? '' : 'disabled'}`)}${p === 'paused' ? btn('Resume', 'resume') : btn('Pause', 'pause', running ? '' : 'disabled')}${btn('Release results', 'release', p === 'idle' || p === 'released' ? 'disabled' : '')}${btn('Reset', 'reset', `class="danger-text" ${p === 'idle' && !state.total ? 'disabled' : ''}`)}</div>
${has ? '' : '<p class="fineprint">Add at least two names before starting.</p>'}
<h3>Who can be voted for</h3><div class="manage-list">${state.candidates.map(c => `<div><strong>${escape(c.name)}</strong>${btn('Remove', 'remove', `data-id="${c.id}"`)}</div>`).join('') || '<div><span class="muted">No names yet.</span></div>'}</div>
<div class="vote-add"><input data-vote-name maxlength="40" placeholder="Add a name" aria-label="Name to add" value="${escape(nameDraft)}">${btn('+ Add', 'add')}</div>
${p === 'idle' ? '' : `<details class="round-results"><summary>Live count · only you can see this <span>+</span></summary>${resultsHtml(true)}</details>`}</section>`;
}

function ballot() {
  const { escape, getTeams } = ctx, p = phase(), open = p === 'open', voted = myCast();
  const votedName = state.candidates.find(c => c.id === voted)?.name;
  if (p === 'idle') return `<section class="panel vote-wait"><h2>Voting isn’t open yet.</h2><p>Keep this page open. The ballot appears as soon as the organizer starts a vote.</p></section>`;
  if (p === 'released') return `<section class="panel"><div class="eyebrow">THE RESULTS</div><h2>${state.total} ${state.total === 1 ? 'vote' : 'votes'} counted</h2>${resultsHtml(false)}</section>`;
  if (p === 'closed') return `<section class="panel vote-wait"><h2>Time’s up.</h2><p>${state.total} ${state.total === 1 ? 'vote is' : 'votes are'} in. Waiting for the organizer to release the results.</p>${votedName ? `<p>You voted for <strong>${escape(votedName)}</strong>.</p>` : ''}</section>`;
  return `<section class="panel vote-ballot"><div class="vote-clock ${open ? '' : 'paused'}"><span>${open ? 'TIME LEFT' : 'PAUSED'}</span><strong id="vote-clock">${clock()}</strong><small>${state.total} ${state.total === 1 ? 'vote' : 'votes'} in</small></div>
<h3>1 · Your team color</h3><div class="vote-options">${getTeams().map(t => `<button type="button" data-vote="team" data-id="${t.id}" aria-pressed="${myTeam === t.id}" ${open ? '' : 'disabled'}>${dot(t)}${escape(t.name)}</button>`).join('')}</div>
<h3>2 · Your vote</h3><div class="vote-options">${state.candidates.map(c => `<button type="button" data-vote="pick" data-id="${c.id}" aria-pressed="${(pick || voted) === c.id}" ${open ? '' : 'disabled'}>${escape(c.name)}</button>`).join('')}</div>
${btn(voted ? 'Change my vote ↗' : 'Cast my vote ↗', 'cast', `class="primary" ${open && !sending ? '' : 'disabled'}`)}
<p class="vote-note" role="status">${votedName ? `Your vote is in for <strong>${escape(votedName)}</strong>. You can change it until time runs out.` : open ? 'Pick your team color and a name, then cast your vote.' : 'Voting is paused. Hang tight.'}</p></section>`;
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
    if (!getTeams().some(t => t.id === myTeam)) return toast('Pick your team color first.');
    if (!choice) return toast('Pick who you’re voting for.');
    sending = true; paint(true);
    const { error: e } = await db.rpc('cast_vote', { p_voter: voterId, p_team: myTeam, p_candidate: choice, p_round: state.round });
    sending = false;
    if (e) toast(e.message); else { cast = { round: state.round, candidate: choice }; store.set('vote-cast', JSON.stringify(cast)); pick = ''; toast('Vote recorded.') }
    return load(true);
  }
  if (!ctx.admin()) return;
  let e;
  if (action === 'add') {
    const name = nameDraft.trim();
    if (!name) return toast('Type a name first.');
    ({ error: e } = await db.from('vote_candidates').insert({ name, sort_order: Math.max(0, ...state.candidates.map(c => c.sort_order)) + 1 }));
    if (!e) nameDraft = '';
  } else if (action === 'remove') ({ error: e } = await db.from('vote_candidates').delete().eq('id', id));
  else {
    if (action === 'reset' && !confirm('Reset voting? All votes from this round are deleted.')) return;
    const seconds = Number(secondsDraft || state.duration);
    if (action === 'start' && !(Number.isInteger(seconds) && seconds >= 5 && seconds <= 600)) return toast('Choose between 5 and 600 seconds.');
    ({ error: e } = await db.rpc('vote_control', { p_action: action, p_seconds: seconds }));
  }
  if (e) toast(e.message);
  await load(true);
  if (action === 'add') document.querySelector('[data-vote-name]')?.focus();
}

export function initVote(context) {
  ctx = context;
  ctx.app.addEventListener('click', ev => { const b = ev.target.closest('[data-vote]'); if (b && !b.disabled) act(b.dataset.vote, b.dataset.id) });
  ctx.app.addEventListener('input', ev => {
    if (ev.target.matches('[data-vote-name]')) nameDraft = ev.target.value;
    if (ev.target.matches('[data-vote-seconds]')) secondsDraft = ev.target.value;
  });
  ctx.app.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.matches('[data-vote-name]')) { ev.preventDefault(); act('add') } });
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
