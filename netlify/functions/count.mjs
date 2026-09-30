/**
 * DDPP enrollment counter
 *
 * Reads the published Feed tab of the Client Log workbook and returns nothing
 * but aggregates. There are no credentials involved: the Apps Script does the
 * counting inside the workbook, and only a single row of integers is published.
 * No submission record, and no API key that could reach one, exists anywhere in
 * this path.
 *
 * The Feed tab is one header row and one data row:
 *   count,unit,goal,completed_rows,updated
 *   23,households,5500,23,2026-09-30T10:20:28-05:00
 *
 * `unit` matters. Until "Number of Children under 3" is added to the Jotform to
 * Sheets field mapping, the workbook can only count households, and says so.
 * When that column appears the Apps Script switches to children on its own and
 * this starts reporting children without a code change.
 *
 * Optional env override, if the sheet is ever republished at a new URL:
 *   DDPP_FEED_URL
 *
 * Returns: {"count":23,"unit":"households","goal":5500,"asOf":"..."}
 */

const FEED_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQf9WX3-Vg9dLyaAeb8lSeQrRRGj8r89QeHfjtkVAlRIHQe9SHX6DbUZePOyE0rlUyqssXqY6PqU8eC/pub?gid=2000152174&single=true&output=csv';

// Warm-instance cache so repeat page loads don't hit Google every time.
let cache = { value: null, at: 0 };
const CACHE_MS = 5 * 60 * 1000; // 5 minutes — matches Google’s own cache on the published CSV

/** Minimal CSV row splitter — handles quoted fields containing commas. */
function splitRow(line) {
  const out = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export default async (request, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300'
  };

  if (cache.value && Date.now() - cache.at < CACHE_MS) {
    return new Response(JSON.stringify({ ...cache.value, cached: true }), { status: 200, headers });
  }

  const url = process.env.DDPP_FEED_URL || FEED_URL;

  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Feed returned ${res.status}`);

    const text = await res.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) throw new Error('Feed has no data row');

    const head = splitRow(lines[0]).map((h) => h.toLowerCase());
    const row = splitRow(lines[1]);
    const field = (name) => {
      const i = head.indexOf(name);
      return i === -1 ? '' : row[i];
    };

    const count = parseInt(field('count'), 10);
    if (isNaN(count)) throw new Error('Feed count is not a number');

    const goal = parseInt(field('goal'), 10);
    const payload = {
      count,
      unit: field('unit') || 'households',
      goal: isNaN(goal) ? 5500 : goal,
      asOf: field('updated') || new Date().toISOString()
    };

    cache = { value: payload, at: Date.now() };
    return new Response(JSON.stringify({ ...payload, cached: false }), { status: 200, headers });
  } catch (err) {
    // If the sheet is unreachable, serve the last known good numbers rather
    // than a broken page. Twelve sites do not need to see our plumbing.
    if (cache.value) {
      return new Response(JSON.stringify({ ...cache.value, stale: true }), { status: 200, headers });
    }
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 502,
      headers
    });
  }
};

export const config = { path: '/api/count' };
