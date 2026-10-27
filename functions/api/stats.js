const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export async function onRequestGet({ request, env }) {
  const key = new URL(request.url).searchParams.get('key');
  if (!env.STATS_KEY || key !== env.STATS_KEY) return json({ error: 'unauthorized' }, 401);
  if (!env.DB) return json({ error: 'DB binding missing' }, 500);

  const all = sql => env.DB.prepare(sql).all().then(r => r.results);
  try {
    const [exams, users, daily, devices, systems, cities, networks] = await Promise.all([
      all(`SELECT exam,
             COUNT(DISTINCT uid) AS users,
             SUM(type = 'answer') AS answers,
             ROUND(100.0 * SUM(type = 'answer' AND correct = 1) / NULLIF(SUM(type = 'answer'), 0), 1) AS accuracy,
             SUM(type = 'finish') AS mock_attempts,
             ROUND(AVG(CASE WHEN type = 'finish' THEN score END), 1) AS mock_avg,
             ROUND(100.0 * SUM(type = 'finish' AND passed = 1) / NULLIF(SUM(type = 'finish'), 0), 1) AS mock_pass_rate
           FROM events GROUP BY exam ORDER BY users DESC`),
      all(`SELECT uid, exam, MAX(os) AS os, MAX(browser) AS browser, MAX(device) AS device,
             MAX(city) AS city, MAX(network) AS network,
             COUNT(DISTINCT CASE WHEN type = 'answer' THEN qid END) AS questions,
             SUM(type = 'answer') AS answers,
             ROUND(100.0 * SUM(type = 'answer' AND correct = 1) / NULLIF(SUM(type = 'answer'), 0), 1) AS accuracy,
             SUM(type = 'finish') AS mock_attempts,
             MAX(CASE WHEN type = 'finish' THEN score END) AS mock_best,
             MIN(ts) AS first_seen, MAX(ts) AS last_seen
           FROM events GROUP BY uid, exam ORDER BY last_seen DESC LIMIT 500`),
      all(`SELECT date(ts / 1000, 'unixepoch') AS day, COUNT(DISTINCT uid) AS users, SUM(type = 'answer') AS answers
           FROM events WHERE ts >= (unixepoch() - 30 * 86400) * 1000
           GROUP BY day ORDER BY day`),
      ...['device', 'os', 'city', 'network'].map(col =>
        all(`SELECT ${col} AS value, COUNT(DISTINCT uid) AS users FROM events GROUP BY ${col} ORDER BY users DESC`)),
    ]);
    return json({ exams, users, daily, dist: { devices, systems, cities, networks } });
  } catch (err) {
    if (String(err).includes('no such table')) return json({ exams: [], users: [], daily: [], dist: { devices: [], systems: [], cities: [], networks: [] } });
    throw err;
  }
}
