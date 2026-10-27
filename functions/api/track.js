const SCHEMA = `CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  uid TEXT NOT NULL,
  exam TEXT NOT NULL,
  type TEXT NOT NULL,
  mode TEXT,
  qid INTEGER,
  correct INTEGER,
  total INTEGER,
  score INTEGER,
  passed INTEGER,
  lang TEXT,
  os TEXT,
  browser TEXT,
  device TEXT,
  country TEXT,
  city TEXT,
  network TEXT
);
CREATE INDEX IF NOT EXISTS events_exam_type ON events (exam, type);
CREATE INDEX IF NOT EXISTS events_uid ON events (uid);`;

function parseUA(ua = '') {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Macintosh|Mac OS X/.test(ua) ? 'Mac'
    : /Linux/.test(ua) ? 'Linux' : 'Khác';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /CriOS|Chrome\//.test(ua) ? 'Chrome'
    : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Khác';
  const device = /iPad|Tablet/.test(ua) ? 'tablet' : /Mobi|iPhone|Android/.test(ua) ? 'mobile' : 'desktop';
  return { os, browser, device };
}

const TYPES = new Set(['open', 'answer', 'finish']);
const str = (v, max) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
const int = v => (Number.isInteger(v) ? v : null);

export async function onRequestPost({ request, env }) {
  if (!env.DB) return new Response(null, { status: 204 });
  let e;
  try { e = await request.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
  const uid = str(e.uid, 64), exam = str(e.exam, 32), type = TYPES.has(e.type) ? e.type : null;
  if (!uid || !exam || !type) return new Response('Bad event', { status: 400 });

  const ua = parseUA(request.headers.get('user-agent') || '');
  const cf = request.cf || {};
  const insert = () => env.DB.prepare(
    'INSERT INTO events (ts, uid, exam, type, mode, qid, correct, total, score, passed, lang, os, browser, device, country, city, network) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(Date.now(), uid, exam, type, str(e.mode, 16), int(e.qid), int(e.correct), int(e.total), int(e.score), int(e.passed), str(e.lang, 8), ua.os, ua.browser, ua.device,
    str(cf.country, 8), str(cf.city, 64), str(cf.asOrganization, 128)).run();

  try {
    await insert();
  } catch (err) {
    if (!String(err).includes('no such table')) throw err;
    await env.DB.exec(SCHEMA.replace(/\n\s*/g, ' ').replace(/; /g, ';\n'));
    await insert();
  }
  return new Response(null, { status: 204 });
}
