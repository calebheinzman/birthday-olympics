// Party-day timeline shown at the bottom of the games page. Games follow the order of the
// game list; minutes are estimates that include time to round people up and explain rules.
export const START = {day: 'Saturday', hour: 14, minute: 0};
// [setup minutes, play minutes] by game name; unknown games fall back to DEFAULT.
const TIMING = {
  'Arms Up': [10, 10],
  'Shuff & Pool': [10, 30],
  "King's Cup": [10, 25],
  'Bodies': [10, 30],
  'Betrayal': [5, 10],
  'Boom Cup': [10, 15],
  'Beerio Kart': [15, 40],
  'Beer Pong': [10, 20],
};
const DEFAULT = [10, 20];
const clock = m => { const h = Math.floor(m / 60) % 24; return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` };

export function buildSchedule(events) {
  let t = START.hour * 60 + START.minute;
  const rows = [], add = (name, minutes, detail, kind) => { rows.push({time: clock(t), name, minutes, detail, kind}); t += minutes };
  add('Arrive, pick teams, grab a drink', 30, 'Team colors and a quick run-through of the rules', 'extra');
  events.forEach(e => {
    const [setup, play] = TIMING[e.name] || DEFAULT;
    add(e.name, setup + play, `${setup} min setup · ${play} min play`, 'game');
  });
  rows.push({time: clock(t), name: 'Final standings & bragging rights', minutes: 0, detail: 'Winners announced', kind: 'extra'});
  return rows;
}

export function scheduleSection(events, escape) {
  const rows = buildSchedule(events);
  return `<section id="schedule" class="schedule-section"><div class="eyebrow">THE GAME PLAN</div><h2>${START.day} schedule</h2><p>We start at ${rows[0].time}. Times are estimates and include a few minutes to round everyone up before each game.</p><ol class="schedule-list">${rows.map(r => `<li class="${r.kind}"><time>${r.time}</time><div><strong>${escape(r.name)}</strong><small>${escape(r.detail)}</small></div>${r.minutes ? `<span>${r.minutes} min</span>` : ''}</li>`).join('')}</ol></section>`;
}
