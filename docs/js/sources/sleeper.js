// Sleeper public API: NFL state, weekly stats, projections, and everything
// about the Boats And Bros league. CORS open, no key.
const API = 'https://api.sleeper.app/v1';
export const BOATS_ID = '1389390879541727232';
export const BOATS_2025 = '1257419435455565824';

async function j(url, label) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${label || 'Sleeper'}: HTTP ${r.status}`);
  return r.json();
}
export const state = () => j(`${API}/state/nfl`, 'Sleeper state');
export const stats = (season, week) => j(`${API}/stats/nfl/regular/${season}/${week}`, 'Sleeper stats');
export const trending = () => j(`${API}/players/nfl/trending/add?lookback_hours=24&limit=25`, 'Sleeper trending');

export async function league(id, week) {
  const [lg, users, rosters, matchups] = await Promise.all([
    j(`${API}/league/${id}`, 'league'), j(`${API}/league/${id}/users`, 'users'),
    j(`${API}/league/${id}/rosters`, 'rosters'), j(`${API}/league/${id}/matchups/${week}`, 'matchups'),
  ]);
  return { lg, users, rosters, matchups };
}
export async function transactions(id, upToWeek) {
  const weeks = []; for (let w = 1; w <= Math.max(1, upToWeek); w++) weeks.push(w);
  const all = await Promise.all(weeks.map(w => j(`${API}/league/${id}/transactions/${w}`, 'transactions').catch(() => [])));
  return all.flat();
}
