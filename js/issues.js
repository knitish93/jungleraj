/* =========================================================
   issues.js — Phase 7 Issue Intelligence Portal
   List page: search, filter, sort, cards, featured
   ========================================================= */
'use strict';

const IssuesList = (() => {
  let all = [], filtered = [];
  let activeCategory = 'all', activeSort = 'trending', activeSeverity = 'all';

  /* ── Boot ──────────────────────────────────────────── */
  async function init() {
    const grid = document.getElementById('issues-grid');
    if (!grid) return;
    grid.innerHTML = jrSkeletonCards(6);
    all = await jrMinDelay(jrLoadData('issues.json'));
    filtered = [...all];
    buildHeroMetrics();
    buildCategoryStrip();
    buildFeatured();
    wireToolbar();
    applyFilters();
  }

  /* ── Hero metrics ─────────────────────────────────── */
  function buildHeroMetrics() {
    setText('iss-count-total',    all.length);
    setText('iss-count-cats',     new Set(all.map(i => i.category)).size);
    setText('iss-count-trending', all.filter(i => i.trending).length);
    setText('iss-count-critical', all.filter(i => i.severity === 'Critical').length);
  }

  /* ── Category strip ─────────────────────────────── */
  function buildCategoryStrip() {
    const strip = document.getElementById('issues-cat-strip');
    if (!strip) return;
    const cats = ['all', ...new Set(all.map(i => i.category)).values()].sort((a, b) => a === 'all' ? -1 : a.localeCompare(b));
    strip.innerHTML = cats.map(c =>
      `<button class="chip ${c === 'all' ? 'active' : ''}" data-cat="${jrEscape(c)}">${c === 'all' ? 'सभी' : jrEscape(c)}</button>`
    ).join('');
    strip.addEventListener('click', e => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      strip.querySelectorAll('[data-cat]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat;
      applyFilters();
    });
  }

  /* ── Featured issue ─────────────────────────────── */
  function buildFeatured() {
    const wrap = document.getElementById('issues-featured');
    if (!wrap) return;
    const feat = all.find(i => i.featured) || all[0];
    if (!feat) return;
    wrap.innerHTML = `
      <a class="issue-featured-card" href="issue-details.html?id=${jrEscape(feat.id)}"
         style="--issue-cover-bg:${feat.color}22">
        <div class="issue-featured-cover">${feat.icon}</div>
        <div class="issue-featured-body">
          <div style="display:flex;gap:var(--sp-3);flex-wrap:wrap;margin-bottom:var(--sp-4)">
            <span class="overline">⭐ विशेष मुद्दा</span>
            <span class="badge badge-saffron">${jrEscape(feat.category)}</span>
            <span class="badge ${severityBadge(feat.severity)}">
              <span class="issue-severity-dot ${severityCls(feat.severity)}"></span>
              ${feat.severity}
            </span>
          </div>
          <h2 style="font-size:var(--fs-2xl);color:var(--color-white);margin-bottom:var(--sp-2)">${jrEscape(feat.title)}</h2>
          <div style="font-family:var(--font-body-hi);font-size:var(--fs-md);color:var(--color-text-muted);margin-bottom:var(--sp-4)">${jrEscape(feat.title_hi)}</div>
          <p style="font-size:var(--fs-sm);color:var(--color-text-muted);line-height:1.7;margin-bottom:var(--sp-5)">${jrEscape(feat.summary.substring(0, 260))}…</p>
          <div style="display:flex;gap:var(--sp-4);align-items:center">
            <span class="btn btn-primary" style="font-size:var(--fs-sm)">मुद्दे की पूरी जानकारी →</span>
            <span style="font-size:var(--fs-xs);color:var(--color-text-dim)">
              📊 ${feat.related_statistics.length} आँकड़े · 📖 ${feat.related_stories.length} कहानियाँ · 🗳 ${feat.related_surveys.length} सर्वे
            </span>
          </div>
        </div>
      </a>`;
  }

  /* ── Toolbar ────────────────────────────────────── */
  function wireToolbar() {
    const search   = document.getElementById('issues-search');
    const sort     = document.getElementById('issues-sort');
    const severity = document.getElementById('issues-severity');
    if (search)   search.addEventListener('input', debounce(() => applyFilters(), 220));
    if (sort)     sort.addEventListener('change', () => { activeSort = sort.value; applyFilters(); });
    if (severity) severity.addEventListener('change', () => { activeSeverity = severity.value; applyFilters(); });
  }

  /* ── Filter + sort + render ─────────────────────── */
  function applyFilters() {
    const q = (document.getElementById('issues-search')?.value || '').toLowerCase().trim();
    filtered = all.filter(i => {
      if (activeCategory !== 'all' && i.category !== activeCategory) return false;
      if (activeSeverity !== 'all' && i.severity !== activeSeverity) return false;
      if (q && !matchSearch(i, q)) return false;
      return true;
    });

    if (activeSort === 'trending')    filtered.sort((a, b) => (b.trending ? 1 : 0) - (a.trending ? 1 : 0));
    if (activeSort === 'priority')    filtered.sort((a, b) => priorityRank(b) - priorityRank(a));
    if (activeSort === 'updated')     filtered.sort((a, b) => b.last_updated.localeCompare(a.last_updated));
    if (activeSort === 'alpha')       filtered.sort((a, b) => a.title.localeCompare(b.title));
    if (activeSort === 'connections') filtered.sort((a, b) => connections(b) - connections(a));

    updateResultCount();
    render();
  }

  function matchSearch(i, q) {
    return [i.title, i.title_hi, i.category, i.summary, ...(i.keywords || [])]
      .some(v => v && v.toLowerCase().includes(q));
  }

  function connections(i) {
    return (i.related_statistics?.length || 0) + (i.related_surveys?.length || 0) +
           (i.related_stories?.length || 0) + (i.related_news?.length || 0);
  }

  function priorityRank(i) {
    return { Critical: 4, High: 3, Medium: 2, Low: 1 }[i.priority] || 0;
  }

  /* ── Render cards ────────────────────────────────── */
  function render() {
    const grid = document.getElementById('issues-grid');
    if (!grid) return;
    if (!filtered.length) { grid.innerHTML = jrEmptyState({ icon: 'search', titleKey: 'common.noResults', subKey: 'common.noResultsSub' }); return; }
    grid.className = 'issues-grid';
    grid.innerHTML = filtered.map(issueCard).join('');
    grid.querySelectorAll('[data-iss-id]').forEach(card => {
      card.addEventListener('click', () => {
        window.location.href = `issue-details.html?id=${card.dataset.issId}`;
      });
    });
  }

  function issueCard(iss) {
    const conn = connections(iss);
    const slug_url = `issue-details.html?id=${jrEscape(iss.id)}`;
    return `
    <article class="card issue-card" data-iss-id="${jrEscape(iss.id)}"
             style="--issue-color:${jrEscape(iss.color || '#c1272d')}">
      <div class="issue-card-top">
        <div class="issue-icon">${iss.icon}</div>
        <div>
          <div class="issue-card-title">${jrEscape(iss.title)}</div>
          <div class="issue-card-title-hi">${jrEscape(iss.title_hi)}</div>
        </div>
      </div>
      <div class="issue-card-badges">
        <span class="badge badge-saffron">${jrEscape(iss.category)}</span>
        <span class="badge ${severityBadge(iss.severity)}">
          <span class="issue-severity-dot ${severityCls(iss.severity)}"></span>${iss.severity}
        </span>
        ${iss.trending ? '<span class="badge badge-green">🔥 ट्रेंडिंग</span>' : ''}
        ${iss.status === 'Active' ? '<span class="badge"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--color-green-bright);margin-right:4px;vertical-align:middle"></span>Active</span>' : ''}
      </div>
      <p class="issue-card-summary">${jrEscape(iss.summary.substring(0, 180))}…</p>
      <div class="issue-card-footer">
        <span class="conn-count">🔗 ${conn} कनेक्शन</span>
        <span style="font-family:var(--font-mono);font-size:10px">${iss.last_updated}</span>
      </div>
    </article>`;
  }

  function updateResultCount() {
    const el = document.getElementById('issues-result-count');
    if (el) el.textContent = `${filtered.length} मुद्दे`;
  }

  /* ── Home widget (trending issues) ────────────────── */
  async function initHomeWidget() {
    const strip = document.getElementById('trending-issues-strip');
    if (!strip) return;
    const data = await jrLoadData('issues.json').catch(() => []);
    const trending = data.filter(i => i.trending || i.featured).slice(0, 6);
    strip.innerHTML = trending.map((iss, i) => `
      <a class="trending-issue-row" href="pages/issue-details.html?id=${jrEscape(iss.id)}">
        <span class="tir-rank">#${i + 1}</span>
        <span class="tir-icon">${iss.icon}</span>
        <div class="tir-text">
          <div class="tir-title">${jrEscape(iss.title)}</div>
          <div class="tir-cat">${jrEscape(iss.category)} · ${iss.severity}</div>
        </div>
        <span class="badge badge-saffron tir-badge">${iss.trending ? '🔥' : '📌'}</span>
      </a>`).join('');
  }

  /* ── Helpers ─────────────────────────────────────── */
  function severityBadge(s) { return { Critical: 'badge-red', High: '', Medium: '', Low: 'badge-green' }[s] || ''; }
  function severityCls(s)   { return `severity-${(s||'').toLowerCase()}`; }
  function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  return { init, initHomeWidget };
})();

document.addEventListener('DOMContentLoaded', () => {
  IssuesList.init();
  IssuesList.initHomeWidget();
});
