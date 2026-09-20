/* =========================================================
   statistics.js — Phase 4 full dashboard engine
   Features: 100 stat cards, sparklines, modal with chart,
             reality check, India map, search, filters, i18n
   ========================================================= */
'use strict';

const StatsDash = (() => {
  const CHART_COLORS = ['#c1272d','#ff9933','#2255a4','#128807','#a78bfa','#0d9488','#f59e0b','#67e8f9'];
  let all = [], filtered = [], activeCategory = 'all', activeSort = 'default';
  let charts = {}; // { modal: ChartInstance }

  /* ══════════════════════════════════════════════════════
     BOOT
  ══════════════════════════════════════════════════════ */
  async function init() {
    const grid = document.getElementById('stats-grid');
    if (!grid) return;

    grid.innerHTML = jrSkeletonCards(12);
    all = await jrMinDelay(jrLoadData('statistics.json'));
    filtered = [...all];

    buildFeaturedStrip();
    buildCategoryStrip();
    buildToolbar();
    renderCards();
    buildRealityCheck();
    buildIndiaMap();
    wireModal();
    wireCounters();
  }

  /* ── Featured strip (top 8 key stats) ─────────────── */
  function buildFeaturedStrip() {
    const strip = document.getElementById('stats-featured-strip');
    if (!strip) return;
    const featured = ['ec001','em001','ed001','hc001','ag002','cr001','jd001','tc002'];
    const picks = featured.map(id => all.find(s => s.id === id)).filter(Boolean).slice(0, 8);
    strip.innerHTML = picks.map(s => `
      <div class="featured-stat-cell" data-stat-id="${jrEscape(s.id)}">
        <span class="fs-value">${jrEscape(s.value)}</span>
        <span class="fs-label">${jrEscape(s.title)}</span>
        <div class="fs-trend ${s.trend}">${trendArrow(s.trend)} ${s.trendPct != null ? Math.abs(s.trendPct)+'%' : ''}</div>
      </div>`).join('');
    strip.querySelectorAll('[data-stat-id]').forEach(el => {
      el.addEventListener('click', () => openModal(el.dataset.statId));
    });
  }

  /* ── Category strip ────────────────────────────────── */
  function buildCategoryStrip() {
    const strip = document.getElementById('stats-category-strip');
    if (!strip) return;
    const cats = ['all', ...new Set(all.map(s => s.category).sort())];
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

  /* ── Toolbar ────────────────────────────────────────── */
  function buildToolbar() {
    const search = document.getElementById('stats-search');
    const sortSel = document.getElementById('stats-sort');
    if (search) search.addEventListener('input', debounce(() => applyFilters(), 250));
    if (sortSel) sortSel.addEventListener('change', () => {
      activeSort = sortSel.value;
      applyFilters();
    });
  }

  /* ── Filter + sort + render ─────────────────────────── */
  function applyFilters() {
    const q = (document.getElementById('stats-search')?.value || '').toLowerCase().trim();
    const lang = jrGetLang();
    filtered = all.filter(s => {
      if (activeCategory !== 'all' && s.category !== activeCategory) return false;
      if (!q) return true;
      const title = lang === 'en' ? (s.title_en || s.title) : s.title;
      return title.toLowerCase().includes(q) ||
             s.category.toLowerCase().includes(q) ||
             s.description?.toLowerCase().includes(q);
    });
    if (activeSort === 'asc')  filtered.sort((a,b) => a.title.localeCompare(b.title));
    if (activeSort === 'desc') filtered.sort((a,b) => b.title.localeCompare(a.title));
    if (activeSort === 'year') filtered.sort((a,b) => b.year - a.year);
    renderCards();
  }

  /* ── Render cards ──────────────────────────────────── */
  function renderCards() {
    const grid = document.getElementById('stats-grid');
    if (!grid) return;
    if (!filtered.length) {
      grid.innerHTML = jrEmptyState({ icon: 'search', titleKey: 'common.noResults', subKey: 'common.noResultsSub' });
      return;
    }
    grid.innerHTML = filtered.map(statCardHtml).join('');
    grid.querySelectorAll('[data-stat-id]').forEach(el => {
      el.addEventListener('click', () => openModal(el.dataset.statId));
    });
    observeCounters(grid);
    renderSparklines(grid);
  }

  /* ── Stat card HTML ────────────────────────────────── */
  function statCardHtml(s) {
    const lang  = jrGetLang();
    const title = lang === 'en' ? (s.title_en || s.title) : s.title;
    const desc  = lang === 'en' ? (s.description_en || s.description || '') : (s.description || '');
    const trend = s.trend || 'stable';
    return `
    <article class="card stat-card" data-stat-id="${jrEscape(s.id)}"
             style="--stat-color:${jrEscape(s.color || '#c1272d')}">
      <div class="stat-card-header">
        <span class="stat-card-icon">${s.icon || '📊'}</span>
        <span class="stat-card-trend ${trend}">${trendArrow(trend)} ${s.trendPct != null ? Math.abs(s.trendPct)+'%' : '—'}</span>
      </div>
      <div class="stat-card-value">${jrEscape(s.value)}</div>
      <div class="stat-card-title">${jrEscape(title)}</div>
      <div class="stat-card-desc">${jrEscape(desc)}</div>
      <canvas class="stat-card-sparkline" id="spark-${jrEscape(s.id)}" height="42"></canvas>
      <div class="stat-card-footer">
        <span class="stat-card-source">${jrIcon('verified', 12)} ${jrEscape(s.source?.split('/')[0] || '')}</span>
        <span class="stat-card-year">${s.year || ''}</span>
      </div>
    </article>`;
  }

  /* ── Sparklines ────────────────────────────────────── */
  function renderSparklines(container) {
    if (!window.Chart) return;
    (container || document).querySelectorAll('.stat-card-sparkline').forEach(canvas => {
      const id = canvas.id.replace('spark-', '');
      const s  = all.find(x => x.id === id);
      if (!s?.history?.length) { canvas.style.display = 'none'; return; }
      const vals = s.history.map(h => h.value);
      new Chart(canvas, {
        type: 'line',
        data: {
          labels: s.history.map(h => h.year),
          datasets: [{
            data: vals,
            borderColor: s.color || '#c1272d',
            borderWidth: 1.5,
            fill: true,
            backgroundColor: (s.color || '#c1272d') + '22',
            tension: 0.4,
            pointRadius: 0,
          }]
        },
        options: {
          responsive: false, animation: { duration: 600 },
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false }, y: { display: false } }
        }
      });
    });
  }

  /* ── Animated counters ─────────────────────────────── */
  function observeCounters(root) {
    if (!window.IntersectionObserver) return;
    const obs = new IntersectionObserver(entries => {
      entries.filter(e => e.isIntersecting).forEach(e => {
        animateCounter(e.target);
        obs.unobserve(e.target);
      });
    }, { threshold: 0.3 });
    (root || document).querySelectorAll('[data-count]').forEach(el => obs.observe(el));
  }

  function animateCounter(el) {
    const end = parseFloat(el.dataset.count);
    if (isNaN(end)) return;
    let start = 0, dur = 1200, step = 16;
    const inc = end / (dur / step);
    const timer = setInterval(() => {
      start = Math.min(start + inc, end);
      el.textContent = start >= end ? end.toLocaleString('en-IN') : Math.floor(start).toLocaleString('en-IN');
      if (start >= end) clearInterval(timer);
    }, step);
  }

  function wireCounters() {
    // Homepage hero counters
    document.querySelectorAll('[data-counter]').forEach(el => {
      el.setAttribute('data-count', el.dataset.counter);
    });
    observeCounters(document);
  }

  /* ══════════════════════════════════════════════════════
     MODAL
  ══════════════════════════════════════════════════════ */
  function wireModal() {
    const overlay = document.getElementById('stat-modal-overlay');
    if (!overlay) return;
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal();
    });
    document.getElementById('stat-modal-close')?.addEventListener('click', closeModal);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });
  }

  function openModal(id) {
    const s = all.find(x => x.id === id);
    if (!s) return;
    const lang    = jrGetLang();
    const title   = lang === 'en' ? (s.title_en || s.title) : s.title;
    const desc    = lang === 'en' ? (s.description_en || s.description || '') : (s.description || '');
    const overlay = document.getElementById('stat-modal-overlay');
    if (!overlay) return;

    // Header
    document.getElementById('sm-icon')?.replaceChildren();
    const iconEl = document.getElementById('sm-icon');
    if (iconEl) iconEl.textContent = s.icon || '📊';
    const valEl = document.getElementById('sm-value');
    if (valEl) valEl.textContent = s.value;
    const titleEl = document.getElementById('sm-title');
    if (titleEl) titleEl.textContent = title;
    const badgesEl = document.getElementById('sm-badges');
    if (badgesEl) badgesEl.innerHTML = `
      <span class="badge badge-saffron">${jrEscape(s.category)}</span>
      <span class="stat-card-trend ${s.trend}">${trendArrow(s.trend)} ${s.trendPct != null ? Math.abs(s.trendPct)+'%' : '—'}</span>
      <span class="badge">${s.year}</span>`;

    // Description
    const descEl = document.getElementById('sm-desc');
    if (descEl) descEl.textContent = desc;

    // Info grid
    const prevEl = document.getElementById('sm-prev');
    if (prevEl) prevEl.textContent = s.prevValue || '—';
    const srcEl = document.getElementById('sm-source');
    if (srcEl) srcEl.textContent = s.source || '—';
    const unitEl = document.getElementById('sm-unit');
    if (unitEl) unitEl.textContent = s.unit || '—';
    const updEl = document.getElementById('sm-updated');
    if (updEl) updEl.textContent = s.last_updated || '—';

    // Related
    const relRow = document.getElementById('sm-related');
    if (relRow) {
      relRow.innerHTML = '';
      if (s.related_survey) {
        const rb = document.createElement('a');
        rb.className = 'stat-related-card';
        rb.textContent = '📊 संबंधित सर्वेक्षण';
        rb.href = `surveys.html?survey=${s.related_survey}`;
        relRow.appendChild(rb);
      }
      if (s.related_story) {
        const rb = document.createElement('a');
        rb.className = 'stat-related-card';
        rb.textContent = '📖 संबंधित कहानी';
        rb.href = `storybook.html`;
        relRow.appendChild(rb);
      }
    }

    // History chart
    if (window.Chart && s.history?.length) {
      const ctx = document.getElementById('sm-chart');
      if (ctx) {
        if (charts.modal) { charts.modal.destroy(); charts.modal = null; }
        Chart.defaults.color = '#a3a1a8';
        charts.modal = new Chart(ctx, {
          type: 'line',
          data: {
            labels: s.history.map(h => h.year),
            datasets: [{
              label: title,
              data: s.history.map(h => h.value),
              borderColor: s.color || '#c1272d',
              borderWidth: 2,
              backgroundColor: (s.color || '#c1272d') + '18',
              fill: true,
              tension: 0.4,
              pointRadius: 4,
              pointBackgroundColor: s.color || '#c1272d',
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false } },
              y: { grid: { color: 'rgba(255,255,255,0.06)' } }
            }
          }
        });
      }
    }

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    document.getElementById('stat-modal-overlay')?.classList.remove('open');
    document.body.style.overflow = '';
  }

  /* ══════════════════════════════════════════════════════
     REALITY CHECK
  ══════════════════════════════════════════════════════ */
  function buildRealityCheck() {
    const grid = document.getElementById('reality-check-grid');
    if (!grid) return;

    const checks = [
      { emoji:'📚', topic:'शिक्षा', sub:'Education', statId:'ed004', surveyId:'s005', storyId:'st006',
        stat:'41 पेपर लीक 2024 में', survey:'89% चाहते हैं सख्त सज़ा', story:'पेपर लीक — एक लड़की की कहानी' },
      { emoji:'🌾', topic:'कृषि', sub:'Agriculture', statId:'ag002', surveyId:'s032', storyId:'st003',
        stat:'11,290 किसान आत्महत्याएँ (2022)', survey:'81% मानते हैं फसल बीमा अप्रभावी', story:'एक किसान की आशा' },
      { emoji:'👩', topic:'महिला सुरक्षा', sub:'Women Safety', statId:'cr001', surveyId:'s017', storyId:'st007',
        stat:'4,45,256 महिला अपराध (2022)', survey:'75% महिलाएँ असुरक्षित महसूस करती हैं', story:'बेटी का सपना' },
      { emoji:'⚖️', topic:'न्यायपालिका', sub:'Judiciary', statId:'jd001', surveyId:'s039', storyId:'st002',
        stat:'5.06 करोड़ लंबित मामले', survey:'95% चाहते हैं न्यायिक सुधार', story:'ईमानदार करदाता' },
      { emoji:'⛽', topic:'ईंधन', sub:'Fuel', statId:'fu001', surveyId:'s001', storyId:'st002',
        stat:'₹94.72/लीटर पेट्रोल दिल्ली में', survey:'84% चाहते हैं पेट्रोल सस्ता हो', story:'ईमानदार करदाता' },
      { emoji:'💼', topic:'रोज़गार', sub:'Employment', statId:'em001', surveyId:'s011', storyId:'st009',
        stat:'23.7% युवा बेरोज़गारी', survey:'82% मानते हैं बेरोज़गारी बढ़ रही है', story:'युवा इंजीनियर' },
    ];

    grid.innerHTML = checks.map(c => `
      <div class="reality-card">
        <div class="reality-card-header">
          <span class="reality-card-emoji">${c.emoji}</span>
          <div>
            <div class="reality-card-topic">${c.topic}</div>
            <div class="reality-card-sub">${c.sub}</div>
          </div>
        </div>
        <div class="reality-chain">
          <div class="reality-step">
            <div class="reality-step-icon" style="background:rgba(193,39,45,.15);border-color:rgba(193,39,45,.3)">📊</div>
            <div>
              <div class="reality-step-type">आधिकारिक आँकड़ा</div>
              <div class="reality-step-text">${jrEscape(c.stat)}</div>
            </div>
          </div>
          <div class="reality-step">
            <div class="reality-step-icon" style="background:rgba(255,153,51,.15);border-color:rgba(255,153,51,.3)">🗳️</div>
            <div>
              <div class="reality-step-type">जनमत सर्वेक्षण</div>
              <div class="reality-step-text">${jrEscape(c.survey)}</div>
            </div>
          </div>
          <div class="reality-step">
            <div class="reality-step-icon" style="background:rgba(167,139,250,.15);border-color:rgba(167,139,250,.3)">📖</div>
            <div>
              <div class="reality-step-type">संबंधित कहानी</div>
              <div class="reality-step-text">${jrEscape(c.story)}</div>
            </div>
          </div>
        </div>
      </div>`).join('');
  }

  /* ══════════════════════════════════════════════════════
     INDIA MAP (placeholder architecture)
  ══════════════════════════════════════════════════════ */
  function buildIndiaMap() {
    const wrap = document.getElementById('india-map-states');
    if (!wrap) return;
    const states = ['आंध्र प्रदेश','असम','बिहार','छत्तीसगढ़','दिल्ली','गोवा','गुजरात','हरियाणा','हिमाचल प्रदेश','झारखंड','कर्नाटक','केरल','मध्य प्रदेश','महाराष्ट्र','मणिपुर','मेघालय','नागालैंड','ओडिशा','पंजाब','राजस्थान','सिक्किम','तमिलनाडु','तेलंगाना','त्रिपुरा','उत्तर प्रदेश','उत्तराखंड','पश्चिम बंगाल'];
    wrap.innerHTML = states.map(s =>
      `<button class="state-pill" data-state="${jrEscape(s)}">${jrEscape(s)}</button>`
    ).join('');
    wrap.addEventListener('click', e => {
      const btn = e.target.closest('[data-state]');
      if (btn) jrToast(`🗺 ${btn.dataset.state} — डेटा जल्द उपलब्ध होगा`);
    });
  }

  /* ── Helpers ─────────────────────────────────────── */
  function trendArrow(trend) {
    if (trend === 'up') return '↑';
    if (trend === 'down') return '↓';
    return '→';
  }
  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  return { init, openModal };
})();

document.addEventListener('DOMContentLoaded', () => StatsDash.init());
