// Sign-up page: guests add their name and team color once; the list feeds the front-page
// rosters and the Bodies ballot. The organizer can add, rename, move and remove people here.
import {deviceId, getProfile, setProfile, store} from './device.js';

let ctx, nameDraft = null, teamDraft = null, editing = false, saving = false, addName = '', addTeam = '';
const dot = t => `<span class="dot" style="--team:${/^#[0-9a-f]{6}$/i.test(t?.color) ? t.color : '#888'}" aria-hidden="true"></span>`;
const btn = (text, action, extra = '') => `<button type="button" data-player="${action}" ${extra}>${text}</button>`;
// This phone's sign-up, read from the live list so organizer edits show up here too.
export const myPlayer = players => { const p = getProfile(); return p && players.find(x => x.id === p.id) || null };

function signupForm(me) {
  const { escape, getTeams } = ctx, name = nameDraft ?? me?.name ?? '', team = teamDraft ?? me?.team_id ?? '';
  return `<section class="panel join-form"><h2>${me ? 'Update your sign-up' : 'Sign up'}</h2><label>Your name<input data-join-name maxlength="40" autocomplete="given-name" placeholder="First name" value="${escape(name)}" ${saving ? 'disabled' : ''}></label>
<h3>Your team color</h3><div class="vote-options">${getTeams().map(t => `<button type="button" data-player="team" data-id="${t.id}" aria-pressed="${team === t.id}" ${saving ? 'disabled' : ''}>${dot(t)}${escape(t.name)}</button>`).join('')}</div>
${btn(me ? 'Save ↗' : 'Join the games ↗', 'save', `class="primary" ${saving ? 'disabled' : ''}`)}${me ? btn('Cancel', 'cancel') : ''}
<p class="fineprint">Saved on this phone, so you won’t need to enter it again when you vote.</p></section>`;
}

function roster() {
  const { escape, getTeams, getPlayers } = ctx, players = getPlayers();
  return `<section class="panel"><h2>Who’s playing <span class="tiny-pill">${players.length} signed up</span></h2><div class="roster">${getTeams().map(t => { const list = players.filter(p => p.team_id === t.id); return `<div><h3>${dot(t)}${escape(t.name)} <small>${list.length}</small></h3><p>${list.map(p => escape(p.name)).join(' · ') || '<span class="muted">No one yet</span>'}</p></div>` }).join('')}</div></section>`;
}

function manage() {
  const { escape, getTeams, getPlayers } = ctx, players = getPlayers(), teams = getTeams();
  const select = (attr, value) => `<select ${attr} aria-label="Team"><option value="">No team</option>${teams.map(t => `<option value="${t.id}" ${value === t.id ? 'selected' : ''}>${escape(t.name)}</option>`).join('')}</select>`;
  const groups = [...teams.map(t => [t.name, players.filter(p => p.team_id === t.id)]), ['No team', players.filter(p => !teams.some(t => t.id === p.team_id))]].filter(([, list]) => list.length);
  return `<section class="panel player-desk"><div class="eyebrow">ORGANIZER ONLY</div><h2>Manage people</h2><p>Everyone here appears on the front page under their team and on the Bodies ballot.</p>
<div class="player-add"><input data-add-name maxlength="40" placeholder="Add a name" aria-label="Name to add" value="${escape(addName)}">${select('data-add-team', addTeam)}${btn('+ Add', 'add')}</div>
${groups.map(([title, list]) => `<h3>${escape(title)} · ${list.length}</h3><div class="manage-list">${list.map(p => `<div class="player-row"><strong>${escape(p.name)}</strong>${select(`data-player-team="${p.id}"`, p.team_id)}${btn('Rename', 'rename', `data-id="${p.id}"`)}${btn('Delete', 'delete', `class="danger-text" data-id="${p.id}"`)}</div>`).join('')}</div>`).join('') || '<p class="fineprint">No one has signed up yet.</p>'}</section>`;
}

export function joinPage() {
  const { escape, getTeams, getPlayers, admin } = ctx, me = myPlayer(getPlayers()), team = me && getTeams().find(t => t.id === me.team_id);
  const mine = me && !editing ? `<section class="panel join-done"><div class="eyebrow">YOU’RE IN</div><h2>${dot(team)}${escape(me.name)}</h2><p>${team ? escape(team.name) : 'No team yet'}</p>${btn('Change my name or team', 'edit')}</section>` : signupForm(me);
  return `<div id="join-root"><section class="page-intro"><div class="eyebrow">SIGN UP</div><h1>JOIN THE<br><em>GAMES.</em></h1><p>Add your name and team color once. You’ll show up on your team and on the ballot.</p></section>${mine}${roster()}${admin() ? manage() : ''}</div>`;
}

const paint = () => { const root = document.querySelector('#join-root'); if (root) root.outerHTML = joinPage() };

async function act(action, id) {
  const { db, toast, getTeams, getPlayers, admin, reload } = ctx, me = myPlayer(getPlayers());
  if (action === 'team') { teamDraft = id; return paint() }
  if (action === 'edit') { editing = true; nameDraft = teamDraft = null; return paint() }
  if (action === 'cancel') { editing = false; nameDraft = teamDraft = null; return paint() }
  if (action === 'save') {
    const name = (nameDraft ?? me?.name ?? '').trim(), team = teamDraft ?? me?.team_id ?? '';
    if (!name) return toast('Type your name first.');
    if (!getTeams().some(t => t.id === team)) return toast('Pick your team color.');
    saving = true; paint();
    const { data, error } = await db.rpc('join_game', { p_device: deviceId, p_name: name, p_team: team });
    saving = false;
    if (error) { toast(error.message); return paint() }
    setProfile({ id: data }); store.set('vote-team', team);
    editing = false; nameDraft = teamDraft = null;
    await reload(); toast(me ? 'Saved.' : 'You’re in!');
    return;
  }
  if (!admin()) return;
  let error;
  const person = getPlayers().find(p => p.id === id);
  if (action === 'add') {
    const name = addName.trim();
    if (!name) return toast('Type a name first.');
    ({ error } = await db.from('vote_candidates').insert({ name, team_id: addTeam || null }));
    if (!error) addName = '';
  } else if (action === 'rename') {
    const name = prompt('New name', person?.name || '')?.trim();
    if (!name) return;
    ({ error } = await db.from('vote_candidates').update({ name: name.slice(0, 40) }).eq('id', id));
  } else if (action === 'delete') {
    if (!confirm(`Remove ${person?.name || 'this person'}? They come off their team and the ballot.`)) return;
    ({ error } = await db.from('vote_candidates').delete().eq('id', id));
  } else if (action === 'move') ({ error } = await db.from('vote_candidates').update({ team_id: ctx.moveTo || null }).eq('id', id));
  if (error) toast(error.message);
  await reload();
  if (action === 'add') document.querySelector('[data-add-name]')?.focus();
}

export function initPlayers(context) {
  ctx = context;
  ctx.app.addEventListener('click', ev => { const b = ev.target.closest('[data-player]'); if (b && !b.disabled) act(b.dataset.player, b.dataset.id) });
  ctx.app.addEventListener('input', ev => {
    if (ev.target.matches('[data-join-name]')) nameDraft = ev.target.value;
    if (ev.target.matches('[data-add-name]')) addName = ev.target.value;
  });
  ctx.app.addEventListener('change', ev => {
    if (ev.target.matches('[data-add-team]')) addTeam = ev.target.value;
    if (ev.target.matches('[data-player-team]')) { ctx.moveTo = ev.target.value; act('move', ev.target.dataset.playerTeam) }
  });
  ctx.app.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter') return;
    if (ev.target.matches('[data-join-name]')) { ev.preventDefault(); act('save') }
    if (ev.target.matches('[data-add-name]')) { ev.preventDefault(); act('add') }
  });
}
