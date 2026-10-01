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
 * The workbook sums "Number of Children under 3" across every application.
 * It does not filter on bs_status — that column is written downstream and is
 * empty on live rows, so filtering on it returned zero.
 *
 * Optional env override, if the sheet is ever republished at a new URL:
 *   DDPP_FEED_URL
 *
 * Returns: {"count":42,"unit":"children","label":"children enrolled","goal":5500,
 *           "applications":36,"asOf":"..."}
 */

const FEED_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQf9WX3-Vg9dLyaAeb8lSeQrRRGj8r89QeHfjtkVAlRIHQe9SHX6DbUZePOyE0rlUyqssXqY6PqU8eC/pub?gid=857921250&single=true&output=csv';

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

    // An unpublished or moved sheet still answers 200 — with an HTML error
    // page. Without this the CSV parser fails somewhere confusing instead of
    // saying what is actually wrong.
    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('csv')) {
      throw new Error('Feed is not CSV — the sheet is unpublished or the gid changed');
    }

    const text = await res.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) throw new Error('Feed has no data row');

    const head = splitRow(lines[0]).map((h) => h.toLowerCase());
    const at = (name) => head.indexOf(name);
    const col = (row, name) => {
      const i = at(name);
      return i === -1 ? '' : (row[i] || '');
    };
    const num = (v) => {
      const n = parseInt(v, 10);
      return isNaN(n) ? null : n;
    };

    const rows = lines.slice(1).map(splitRow);
    const iType = at('type');

    // Row 2 is the totals; every row after it is one site. An older feed had
    // no type column at all, in which case the single data row is the totals.
    const totals = iType === -1 ? rows[0] : rows.find((r) => r[iType] === 'total');
    if (!totals) throw new Error('Feed has no totals row');

    const count = num(col(totals, 'children')) ?? num(col(totals, 'count'));
    if (count === null) throw new Error('Feed count is not a number');

    const unit = col(totals, 'unit') || 'children';

    const sites = (iType === -1 ? [] : rows.filter((r) => r[iType] === 'site'))
      .map((r) => ({
        name: col(r, 'name'),
        applications: num(col(r, 'applications')),
        children: num(col(r, 'children'))
      }))
      .filter((s) => s.name && s.children !== null)
      .sort((a, b) => b.children - a.children);

    const payload = {
      count,
      unit,
      // The sheet owns the wording, so it can be changed without a deploy.
      label: col(totals, 'label') || (unit + ' enrolled'),
      goal: num(col(totals, 'goal')) ?? 5500,
      applications: num(col(totals, 'applications')),
      sites,
      asOf: col(totals, 'updated') || new Date().toISOString()
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
