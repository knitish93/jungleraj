/* =========================================================
   api.js — JSON data loading helper
   All content is loaded dynamically from /data/*.json.
   Nothing is ever hardcoded in page markup or JS.
   ========================================================= */

/**
 * Resolves the correct relative path to /data/ depending on whether
 * the current page lives at the site root (index.html) or inside /pages/.
 */
function jrDataPath(file) {
  const inPages = window.location.pathname.includes('/pages/');
  return (inPages ? '../data/' : 'data/') + file;
}

/**
 * Fetches a JSON data file and returns a parsed array/object.
 * Resolves to [] (or {} if asObject) on any failure so callers can
 * render an empty/error state instead of throwing.
 */
async function jrLoadData(file, { asObject = false } = {}) {
  const fallback = asObject ? {} : [];
  try {
    const res = await fetch(jrDataPath(file), { cache: 'default' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('[JungleRaj] Failed to load', file, err);
    return fallback;
  }
}

/** Simulates a minimum perceived loading time so skeletons don't just flash. */
function jrMinDelay(promise, ms = 400) {
  return Promise.all([promise, new Promise(r => setTimeout(r, ms))]).then(([result]) => result);
}
