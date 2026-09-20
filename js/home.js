/* =========================================================
   home.js — Phase 4 dashboard home page
   Loads: statistics.json, surveys.json, stories.json, news.json
   Renders: live stats, trending surveys, latest stories,
            news widget, reality check, trending issues
   ========================================================= */
'use strict';

const HomeP4 = (() => {
  // Store data for language change rebuilds
  let cachedData = { stats: [], surveys: [], stories: [], news: [], politicians: [] };

  /* ══════════════════════════════════════════════════════
     BOOT
  ══════════════════════════════════════════════════════ */
  async function init() {
    if (!document.getElementById('main')) return;

    // Parallel load
    const [stats, surveys, stories, news, politicians] = await Promise.all([
      jrLoadData('statistics.json').catch(() => []),
      jrLoadData('surveys.json').catch(() => []),
      jrLoadData('stories.json').catch(() => []),
      jrLoadData('news.json').catch(() => []),
      jrLoadData('politicians.json').catch(() => []),
    ]);

    // Cache data for language change rebuilds
    cachedData = { stats, surveys, stories, news, politicians };

    buildTicker(news);
    buildLiveStats(stats);
    buildTrendingSurveys(surveys);
    buildLatestStories(stories);
    buildNewsWidget(news);
    buildDashboardCharts(surveys);
    buildRealityCheckMini(stats);
    buildTrendingIssues(stats, news);
    buildHeroCounters(surveys, stats);

    // Listen for language changes to rebuild dynamic content
    document.addEventListener('jr:langchange', () => {
      buildTicker(cachedData.news);
      buildLiveStats(cachedData.stats);
      buildTrendingSurveys(cachedData.surveys);
      buildLatestStories(cachedData.stories);
      buildNewsWidget(cachedData.news);
      buildDashboardCharts(cachedData.surveys);
      buildRealityCheckMini(cachedData.stats);
      buildTrendingIssues(cachedData.stats, cachedData.news);
    });
  }

  /* ── News ticker ──────────────────────────────────── */
  function buildTicker(news) {
    const track = document.getElementById('ticker-track');
    if (!track) return;
    const lang = jrGetLang();
    const items = news.length
      ? news.map(n => {
          const title = lang === 'en' ? (n.title_en || n.title) : n.title;
          return `<span class="ticker-item"><strong>${jrEscape(n.category)}</strong>&nbsp;${jrEscape(title)}</span>`;
        }).join('')
      : `<span class="ticker-item"><strong>—</strong>&nbsp;${jrT('common.loading')}</span>`;
    track.innerHTML = items + items; // duplicate for seamless loop
  }

  /* ── Hero counters ────────────────────────────────── */
  function buildHeroCounters(surveys, stats) {
    const activeSurveys  = surveys.filter(s => s.status === 'active' || s.status === 'open').length || surveys.length;
    const leaders        = 47; // placeholder
    const sources        = [...new Set(stats.map(s => s.source))].length;

    const setCounter = (sel, val) => {
      const el = document.querySelector(sel);
      if (el) { el.dataset.counter = val; el.textContent = val; }
    };
    setCounter('[data-counter]:nth-of-type(1)', activeSurveys);
    setCounter('[data-counter]:nth-of-type(2)', leaders);
    setCounter('[data-counter]:nth-of-type(3)', sources);

    // Animate when in view
    if (!window.IntersectionObserver) return;
    const obs = new IntersectionObserver(entries => {
      entries.filter(e => e.isIntersecting).forEach(e => {
        const el = e.target;
        const end = parseFloat(el.dataset.counter);
        if (isNaN(end)) return;
        let cur = 0, dur = 1400, step = 16, inc = end / (dur / step);
        const t = setInterval(() => {
          cur = Math.min(cur + inc, end);
          el.textContent = cur >= end ? end.toLocaleString('en-IN') : Math.floor(cur).toLocaleString('en-IN');
          if (cur >= end) clearInterval(t);
        }, step);
        obs.unobserve(el);
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('[data-counter]').forEach(el => obs.observe(el));
  }

  /* ── Live stats strip ─────────────────────────────── */
  function buildLiveStats(stats) {
    const el = document.getElementById('home-live-stats');
    if (!el) return;
    const lang = jrGetLang();
    const picks = ['ec002','em001','ed001','hc001','ag002','cr001','fu001','tc002'];
    const chosen = picks.map(id => stats.find(s => s.id === id)).filter(Boolean).slice(0, 8);
    el.innerHTML = chosen.map(s => {
      const title = lang === 'en' ? (s.title_en || s.title) : s.title;
      return `
      <a class="live-stat-cell" href="pages/statistics.html">
        <div class="ls-icon">${s.icon}</div>
        <div class="ls-value">${jrEscape(s.value)}</div>
        <div class="ls-label">${jrEscape(title)}</div>
        <div class="ls-trend ${s.trend}">${trendArrow(s.trend)} ${s.trendPct != null ? Math.abs(s.trendPct)+'%' : ''}</div>
      </a>`;
    }).join('');
  }

  /* ── Trending surveys ─────────────────────────────── */
  function buildTrendingSurveys(surveys) {
    const grid = document.getElementById('trending-surveys-grid');
    if (!grid) return;
    if (!surveys.length) { grid.innerHTML = jrEmptyState({ icon: 'poll', titleKey: 'common.comingSoon', subKey: 'common.comingSoonSub' }); return; }
    const picks = surveys.filter(s => s.featured || s.trending).slice(0, 3);
    const show  = picks.length ? picks : surveys.slice(0, 3);
    const lang = jrGetLang();
    grid.innerHTML = show.map(s => {
      const title = lang === 'en' ? (s.title_en || s.title || s.titleEn || '') : (s.title || '');
      const cat   = s.category || s.theme || '';
      const responseLabel = lang === 'en' ? 'responses' : 'प्रतिक्रियाएँ';
      return `
        <article class="card" data-href="pages/surveys.html">
          ${cat ? `<span class="badge badge-saffron">${jrEscape(cat)}</span>` : ''}
          <h3 class="card-title" style="margin-top:var(--sp-3)">${jrEscape(title)}</h3>
          <div style="display:flex;gap:var(--sp-4);margin-top:var(--sp-4);font-size:var(--fs-xs);color:var(--color-text-dim)">
            <span>📊 ${(s.responses || s.totalResponses || 0).toLocaleString('en-IN')} ${responseLabel}</span>
          </div>
        </article>`;
    }).join('');
    grid.querySelectorAll('[data-href]').forEach(card => {
      card.addEventListener('click', () => { window.location.href = card.dataset.href; });
      card.style.cursor = 'pointer';
    });
  }

  /* ── Latest stories (storybook) ───────────────────── */
  function buildLatestStories(stories) {
    const el = document.getElementById('storybook-strip');
    if (!el) return;
    // Homepage only ever shows the explicitly featured, publicly active stories
    // (not just "the first 4 in the file") — currently: Journey of a Rupee and
    // A Day in the Life of India's Democracy.
    const show = stories.filter(s => s.active === true && s.featured === true);
    if (!show.length) { el.innerHTML = jrEmptyState({ icon: 'book', titleKey: 'common.comingSoon', subKey: 'common.comingSoonSub' }); return; }
    el.className = 'card-grid';
    el.innerHTML = show.map(s => {
      const lang  = jrGetLang();
      const title = lang === 'en' ? (s.title_en || s.title || '') : (s.title || '');
      const theme = s.category || '';
      const emoji = s.coverEmoji || '📖';
      const color = s.coverColor || 'var(--color-saffron)';
      const excerpt = lang === 'en' ? (s.subtitle_en || s.subtitle || '') : (s.subtitle || s.subtitle_en || '');
      return `
        <article class="card story-preview-card" style="cursor:pointer;padding:0" data-href="pages/storybook.html">
          <div class="story-preview-cover" style="background:linear-gradient(135deg, ${color}33, ${color}11)">
            <span>${emoji}</span>
          </div>
          <div class="story-preview-body">
            ${theme ? `<span class="badge badge-saffron story-tag">${jrEscape(theme)}</span>` : ''}
            <h3 class="card-title" style="margin-top:var(--sp-2)">${jrEscape(title)}</h3>
            <p class="card-text" style="font-size:var(--fs-sm);color:var(--color-text-muted)">${jrEscape(excerpt.substring(0, 90))}</p>
            <span class="story-preview-cta">${jrEscape(jrT('storybook.readStoryCta', lang))} →</span>
          </div>
        </article>`;
    }).join('');
    el.querySelectorAll('[data-href]').forEach(card => {
      card.addEventListener('click', () => { window.location.href = card.dataset.href; });
    });
  }

  /* ── News widget ──────────────────────────────────── */
  function buildNewsWidget(news) {
    const el = document.getElementById('news-preview-grid');
    if (!el) return;
    if (!news.length) { el.innerHTML = jrEmptyState({ icon: 'newspaper', titleKey: 'common.comingSoon', subKey: 'common.comingSoonSub' }); return; }
    const show = news.slice(0, 6);
    el.className = 'news-widget-grid';
    el.innerHTML = show.map(n => `
      <a class="news-item" href="pages/news.html">
        <span class="news-item-icon">${n.icon || '📰'}</span>
        <div class="news-item-body">
          <div class="news-item-cat">${jrEscape(n.category || '')}</div>
          <div class="news-item-title">${jrEscape(jrGetLang() === 'en' ? (n.title_en || n.title) : n.title)}</div>
          <div class="news-item-date">${formatDate(n.date)}</div>
        </div>
      </a>`).join('');
  }

  /* ── Dashboard charts ─────────────────────────────── */
  function buildDashboardCharts(surveys) {
    if (!window.Chart) return;
    Chart.defaults.color = '#a3a1a8';

    // Trend chart — survey responses over months (simulated)
    const trendCtx = document.getElementById('trendChart');
    if (trendCtx) {
      const lang = jrGetLang();
      const months = lang === 'en'
        ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        : ['जन','फर','मार','अप्र','मई','जून','जुल','अग','सित','अक्त','नव','दिस'];
      const data   = [820,1240,980,1560,2100,1890,2340,2750,3100,2890,3420,3800];
      const label = lang === 'en' ? 'Survey responses' : 'सर्वेक्षण प्रतिक्रियाएँ';
      new Chart(trendCtx, {
        type: 'line',
        data: { labels: months, datasets: [{ label, data, borderColor: '#c1272d', backgroundColor: '#c1272d18', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#c1272d' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { color: '#ffffff0a' } } } }
      });
    }

    // Category chart
    const catCtx = document.getElementById('categoryChart');
    if (catCtx && surveys.length) {
      const lang = jrGetLang();
      const defaultCat = lang === 'en' ? 'Other' : 'अन्य';
      const catMap = {};
      surveys.forEach(s => { const c = s.category || s.theme || defaultCat; catMap[c] = (catMap[c] || 0) + 1; });
      const cats = Object.entries(catMap).sort((a,b) => b[1]-a[1]).slice(0, 6);
      new Chart(catCtx, {
        type: 'doughnut',
        data: {
          labels: cats.map(c => c[0]),
          datasets: [{ data: cats.map(c => c[1]), backgroundColor: ['#c1272d','#ff9933','#2255a4','#128807','#a78bfa','#0d9488'], borderColor: 'transparent', borderWidth: 0, hoverOffset: 8 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } } } }
      });
    }
  }

  /* ── Reality check mini (home) ────────────────────── */
  function buildRealityCheckMini(stats) {
    const el = document.getElementById('home-reality-check');
    if (!el) return;
    const lang = jrGetLang();
    const checks = [
      { emoji:'📚', topicKey:'rc.education', statId:'ed004', stat_hi:'41 पेपर लीक (2024)', stat_en:'41 Paper leaks (2024)', survey_hi:'89% सख्त कानून चाहते हैं', survey_en:'89% want strict laws' },
      { emoji:'⚖️', topicKey:'rc.judiciary', statId:'jd001', stat_hi:'5.06 करोड़ लंबित मामले', stat_en:'5.06 Cr pending cases', survey_hi:'95% न्यायिक सुधार चाहते हैं', survey_en:'95% want judicial reform' },
      { emoji:'💼', topicKey:'rc.employment', statId:'em001', stat_hi:'8.1% बेरोज़गारी', stat_en:'8.1% unemployment', survey_hi:'82% मानते हैं बेरोज़गारी बढ़ रही', survey_en:'82% say unemployment rising' },
      { emoji:'🌾', topicKey:'rc.agriculture', statId:'ag002', stat_hi:'11,290 किसान आत्महत्याएँ', stat_en:'11,290 farmer suicides', survey_hi:'81% बीमा अप्रभावी मानते हैं', survey_en:'81% say insurance ineffective' },
      { emoji:'⛽', topicKey:'rc.fuel', statId:'fu001', stat_hi:'₹94.72/लीटर पेट्रोल', stat_en:'₹94.72/liter petrol', survey_hi:'84% चाहते हैं राहत', survey_en:'84% want relief' },
      { emoji:'👩', topicKey:'rc.womenSafety', statId:'cr001', stat_hi:'4,45,256 महिला अपराध', stat_en:'4,45,256 crimes against women', survey_hi:'75% असुरक्षित महसूस करती हैं', survey_en:'75% feel unsafe' },
    ];
    el.innerHTML = checks.map(c => {
      const stat = stats.find(s => s.id === c.statId);
      const topic = jrT(c.topicKey);
      const stat_text = lang === 'en' ? c.stat_en : c.stat_hi;
      const survey_text = lang === 'en' ? c.survey_en : c.survey_hi;
      return `
        <div class="home-rc-card" onclick="window.location='pages/statistics.html'" style="cursor:pointer">
          <div class="home-rc-icon">${c.emoji}</div>
          <div class="home-rc-topic">${topic}</div>
          <div class="home-rc-stat">📊 ${stat_text}</div>
          <div class="home-rc-survey">🗳️ ${survey_text}</div>
        </div>`;
    }).join('');
  }

  /* ── Trending issues ──────────────────────────────── */
  function buildTrendingIssues(stats, news) {
    const el = document.getElementById('trending-issues-bar');
    if (!el) return;
    const issues = [
      { icon:'📝', key:'issues.paperLeaks' },
      { icon:'🧑‍💼', key:'issues.unemployment' },
      { icon:'⛽', key:'issues.fuelPrices' },
      { icon:'⚖️', key:'issues.courtDelays' },
      { icon:'🌾', key:'issues.farmerCrisis' },
      { icon:'💻', key:'issues.cybercrime' },
      { icon:'👩', key:'issues.womenSafety' },
      { icon:'📚', key:'issues.education' },
    ];
    el.innerHTML = issues.map((it, i) => `
      <button class="trending-pill" onclick="window.location='pages/statistics.html'">
        <span class="tp-rank">#${i + 1}</span>
        <span>${it.icon}</span>
        <span>${jrT(it.key)}</span>
      </button>`).join('');
  }

  /* ── Helpers ─────────────────────────────────────── */
  function trendArrow(t) { return t === 'up' ? '↑' : t === 'down' ? '↓' : '→'; }
  function formatDate(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('hi-IN', { day:'numeric', month:'short', year:'numeric' }); }
    catch { return d; }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => HomeP4.init());
