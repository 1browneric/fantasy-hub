// RT Sports leagues: guest pages parsed by the Actions cron into docs/data/rt/.
export async function load(key) {
  const r = await fetch(`data/rt/${key}.json`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`RT ${key}: HTTP ${r.status}`);
  return r.json();
}
