// What this phone remembers. Nobody makes an account: a random device id and the
// person's sign-up are kept in the browser's storage so they don't have to re-enter them.
export const store = {
  get(k) { try { return localStorage.getItem(k) } catch { return null } },
  set(k, v) { try { localStorage.setItem(k, v) } catch { /* private window: keep in memory only */ } },
};
export const deviceId = store.get('vote-voter') || crypto.randomUUID();
store.set('vote-voter', deviceId);
let profile = JSON.parse(store.get('player-profile') || 'null'); // {id} of this phone's sign-up
export const getProfile = () => profile;
export const setProfile = p => { profile = p; store.set('player-profile', JSON.stringify(p)) };
