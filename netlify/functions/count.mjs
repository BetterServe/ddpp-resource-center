/**
 * DDPP enrollment counter
 *
 * Calls Jotform server side, holds the API key as an environment variable,
 * and returns nothing but a number. The API key never reaches the browser.
 *
 * Environment variables to set in Netlify (Site configuration > Environment variables):
 *   JOTFORM_API_KEY   your Jotform API key
 *   JOTFORM_FORM_IDS  one form ID, or several separated by commas
 *   JOTFORM_BASE      optional. Use https://eu-api.jotform.com if your account is on Jotform EU.
 *
 * Returns: {"count": 847, "asOf": "2026-09-18T15:04:00.000Z"}
 */

// Warm-instance cache so repeat page loads don't hit Jotform every time.
let cache = { value: null, at: 0 };
const CACHE_MS = 10 * 60 * 1000; // 10 minutes

export default async (request, context) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=600"
  };

  // Serve from cache if it's fresh
  if (cache.value !== null && Date.now() - cache.at < CACHE_MS) {
    return new Response(
      JSON.stringify({ count: cache.value, asOf: new Date(cache.at).toISOString(), cached: true }),
      { status: 200, headers }
    );
  }

  const key = process.env.JOTFORM_API_KEY;
  const ids = (process.env.JOTFORM_FORM_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const base = process.env.JOTFORM_BASE || "https://api.jotform.com";

  if (!key || ids.length === 0) {
    return new Response(
      JSON.stringify({ error: "Missing JOTFORM_API_KEY or JOTFORM_FORM_IDS" }),
      { status: 500, headers }
    );
  }

  try {
    // Pull form metadata only. This returns a submission count without
    // returning any submission records, so no family data moves through here.
    const results = await Promise.all(
      ids.map(async (id) => {
        const res = await fetch(`${base}/form/${id}?apiKey=${encodeURIComponent(key)}`);
        if (!res.ok) throw new Error(`Jotform returned ${res.status} for form ${id}`);
        const json = await res.json();
        return parseInt(json?.content?.count ?? 0, 10) || 0;
      })
    );

    const total = results.reduce((a, b) => a + b, 0);
    cache = { value: total, at: Date.now() };

    return new Response(
      JSON.stringify({ count: total, asOf: new Date().toISOString(), cached: false }),
      { status: 200, headers }
    );
  } catch (err) {
    // If Jotform is down, serve the last known good number rather than a broken page.
    if (cache.value !== null) {
      return new Response(
        JSON.stringify({ count: cache.value, asOf: new Date(cache.at).toISOString(), stale: true }),
        { status: 200, headers }
      );
    }
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 502,
      headers
    });
  }
};

export const config = { path: "/api/count" };
