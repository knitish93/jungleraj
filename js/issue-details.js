/* =========================================================
   issue-details.js — Phase 7 Issue Intelligence Portal
   Details page engine: all 10 sections interconnected
   ========================================================= */
'use strict';

const IssueDetail = (() => {

  /* ── State ─────────────────────────────────────────── */
  let issue = null;
  let stats = [], news = [], surveys = [], stories = [], politicians = [], allIssues = [];
  let summaryLang = 'en';
  let sectionObserver = null;

  /* UI-label translation helper (site-wide hi/en toggle) — distinct from
     issue.summary/summary_hi, which has its own inline EN/HI switch. */
  function L(hi, en) { return (typeof jrGetLang === 'function' && jrGetLang() === 'en') ? en : hi; }

  /* ── Boot ──────────────────────────────────────────── */
  async function init() {
    const container = document.getElementById('issue-detail-main');
    if (!container) return;

    const id = new URLSearchParams(window.location.search).get('id') || '';

    // Parallel load all data
    container.style.opacity = '.3';
    [issue, stats, news, surveys, stories, politicians, allIssues] = await Promise.all([
      jrLoadData('issues.json').then(d => d.find(i => i.id === id) || d[0]),
      jrLoadData('statistics.json').catch(() => []),
      jrLoadData('news.json').catch(() => []),
      jrLoadData('surveys.json').catch(() => []),
      jrLoadData('stories.json').catch(() => []),
      jrLoadData('politicians.json').catch(() => []),
      jrLoadData('issues.json').catch(() => []),
    ]);
    container.style.opacity = '1';

    if (!issue) { container.innerHTML = `<p style="color:var(--color-text-muted);padding:var(--sp-8)">${L('मुद्दा नहीं मिला।','Issue not found.')}</p>`; return; }

    document.title = `${issue.title} | ${L('जंगल राज','Jungle Raj')}`;
    buildAll();
    document.addEventListener('jr:langchange', buildAll);
  }

  function buildAll() {
    buildHero();
    buildSectionNav();
    buildSummary();
    buildTimeline();
    buildStatistics();
    buildNews();
    buildSurveys();
    buildStories();
    buildPoliticians();
    buildDocuments();
    buildFAQ();
    buildPublicOpinion();
    buildRelatedIssues();
    wireSectionNav();
    wireAccordion();
  }

  /* ═══════════════════════════════════════════════════
     HERO
  ═══════════════════════════════════════════════════ */
  function buildHero() {
    setText('id-icon', issue.icon);
    setText('id-title', issue.title);
    setText('id-title-hi', issue.title_hi);
    setText('id-category', issue.category);
    setText('id-severity', issue.severity);
    setText('id-status', issue.status);
    setText('id-updated', issue.last_updated);
    setText('id-priority', issue.priority);

    const heroEl = document.getElementById('issue-detail-hero');
    if (heroEl) heroEl.style.setProperty('--issue-hero-color', issue.color || '#c1272d');

    // Breadcrumb
    const bc = document.getElementById('id-breadcrumb');
    if (bc) bc.innerHTML = `<a href="issues.html" style="color:var(--color-saffron)">${L('मुद्दे','Issues')}</a> → ${jrEscape(issue.category)} → ${jrEscape(issue.title)}`;
  }

  /* ═══════════════════════════════════════════════════
     SECTION NAV
  ═══════════════════════════════════════════════════ */
  function buildSectionNav() {
    const sections = [
      { id: 'sec-summary',    icon: '📋', label: L('सारांश','Summary') },
      { id: 'sec-timeline',   icon: '📅', label: L('टाइमलाइन','Timeline') },
      { id: 'sec-statistics', icon: '📊', label: L('आँकड़े','Statistics') },
      { id: 'sec-news',       icon: '📰', label: L('समाचार','News') },
      { id: 'sec-surveys',    icon: '🗳️', label: L('सर्वेक्षण','Surveys') },
      { id: 'sec-stories',    icon: '📖', label: L('कहानियाँ','Stories') },
      { id: 'sec-politicians',icon: '🏛️', label: L('नेतागण','Politicians') },
      { id: 'sec-documents',  icon: '📄', label: L('दस्तावेज़','Documents') },
      { id: 'sec-faq',        icon: '❓', label: 'FAQ' },
      { id: 'sec-related',    icon: '🔗', label: L('संबंधित','Related') },
    ].filter(s => hasSectionContent(s.id));

    const nav = document.getElementById('issue-section-nav');
    if (!nav) return;
    nav.innerHTML = sections.map(s =>
      `<button class="issue-nav-btn" data-sec="${s.id}">${s.icon} ${s.label}</button>`
    ).join('');
  }

  function hasSectionContent(secId) {
    const checks = {
      'sec-timeline':    (issue.timeline?.length || 0) > 0,
      'sec-statistics':  (issue.related_statistics?.length || 0) > 0,
      'sec-news':        (issue.related_news?.length || 0) > 0,
      'sec-surveys':     (issue.related_surveys?.length || 0) > 0,
      'sec-stories':     (issue.related_stories?.length || 0) > 0,
      'sec-politicians': (issue.related_politicians?.length || 0) > 0,
      'sec-documents':   (issue.official_documents?.length || 0) > 0,
      'sec-faq':         (issue.faq?.length || 0) > 0,
      'sec-related':     (issue.related_issues?.length || 0) > 0,
    };
    return checks[secId] !== false;
  }

  function wireSectionNav() {
    const nav = document.getElementById('issue-section-nav');
    if (!nav) return;
    nav.querySelectorAll('[data-sec]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.sec);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // Highlight active section on scroll
    if (!window.IntersectionObserver) return;
    if (sectionObserver) sectionObserver.disconnect();
    sectionObserver = new IntersectionObserver(entries => {
      entries.filter(e => e.isIntersecting).forEach(e => {
        nav.querySelectorAll('[data-sec]').forEach(b => b.classList.toggle('active', b.dataset.sec === e.target.id));
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    document.querySelectorAll('.issue-section').forEach(sec => sectionObserver.observe(sec));
  }

  /* ═══════════════════════════════════════════════════
     SUMMARY
  ═══════════════════════════════════════════════════ */
  function buildSummary() {
    const wrap = document.getElementById('sec-summary');
    if (!wrap) return;

    const hasHindi = !!issue.summary_hi;
    wrap.innerHTML = `
      <div class="issue-section-eyebrow">
        <span class="s-icon">📋</span>
        <span class="overline">${L('सारांश','Summary')}</span>
      </div>
      <h2 class="section-title" style="font-size:var(--fs-2xl)">${L('यह मुद्दा क्या है?','What is this issue?')}</h2>
      ${hasHindi ? `<div class="issue-lang-toggle">
        <button class="issue-lang-btn active" id="lang-en">English</button>
        <button class="issue-lang-btn" id="lang-hi">हिंदी</button>
      </div>` : ''}
      <div class="issue-summary-card">
        <p class="issue-summary-text" id="summary-text">${jrEscape(issue.summary)}</p>
      </div>
      <div class="issue-transparency-note">
        ℹ️ ${L(
          'यह जानकारी सार्वजनिक रूप से उपलब्ध स्रोतों, आधिकारिक रिपोर्टों और सरकारी डेटा पर आधारित है। जंगल राज किसी भी व्यक्ति, पार्टी या संस्था को ज़िम्मेदार या दोषी नहीं ठहराता।',
          'This information is based on publicly available sources, official reports and government data. Jungle Raj does not hold any individual, party or institution liable or guilty.'
        )}
      </div>`;

    document.getElementById('lang-en')?.addEventListener('click', () => {
      document.getElementById('summary-text').textContent = issue.summary;
      document.getElementById('summary-text').classList.remove('hindi');
      setLangActive('en');
    });
    document.getElementById('lang-hi')?.addEventListener('click', () => {
      document.getElementById('summary-text').textContent = issue.summary_hi || issue.summary;
      document.getElementById('summary-text').classList.add('hindi');
      setLangActive('hi');
    });
  }

  function setLangActive(lang) {
    document.getElementById('lang-en')?.classList.toggle('active', lang === 'en');
    document.getElementById('lang-hi')?.classList.toggle('active', lang === 'hi');
  }

  /* ═══════════════════════════════════════════════════
     TIMELINE
  ═══════════════════════════════════════════════════ */
  function buildTimeline() {
    const wrap = document.getElementById('sec-timeline');
    if (!wrap || !issue.timeline?.length) { hideSection(wrap); return; }

    wrap.innerHTML = `
      <div class="issue-section-eyebrow"><span class="s-icon">📅</span><span class="overline">${L('टाइमलाइन','Timeline')}</span></div>
      <h2 class="section-title" style="font-size:var(--fs-2xl)">${L('घटनाक्रम','Timeline of Events')}</h2>
      <div class="issue-timeline">${issue.timeline.map(tl => `
        <div class="timeline-entry">
          <div class="timeline-line-col"><div class="tl-dot"></div><div class="tl-line"></div></div>
          <div class="tl-content">
            <div class="tl-year-badge">📅 ${jrEscape(String(tl.year))} ${tl.month ? '· ' + jrEscape(tl.month) : ''}</div>
            <div class="tl-event">${jrEscape(tl.event)}</div>
            <div class="tl-desc">${jrEscape(tl.description || '')}</div>
            ${tl.reference ? `<div class="tl-ref">📎 ${L('स्रोत','Source')}: ${jrEscape(tl.reference)}</div>` : ''}
          </div>
        </div>`).join('')}
      </div>`;
  }

  /* ═══════════════════════════════════════════════════
     STATISTICS
  ═══════════════════════════════════════════════════ */
  function buildStatistics() {
    const wrap = document.getElementById('sec-statistics');
    if (!wrap) return;
    const relStats = (issue.related_statistics || []).map(id => stats.find(s => s.id === id)).filter(Boolean);
    if (!relStats.length) { hideSection(wrap); return; }

    wrap.innerHTML = `
      <div class="issue-section-eyebrow"><span class="s-icon">📊</span><span class="overline">${L('आधिकारिक आँकड़े','Official Statistics')}</span></div>
      <h2 class="section-title" style="font-size:var(--fs-2xl)">${L('संबंधित आँकड़े','Related Statistics')}</h2>
      <div class="issue-stat-grid">${relStats.map(s => `
        <div class="issue-stat-mini" onclick="window.location.href='statistics.html'">
          <div style="font-size:1.4rem;margin-bottom:var(--sp-2)">${s.icon || '📊'}</div>
          <div class="ism-value">${jrEscape(s.value)}</div>
          <div class="ism-title">${jrEscape(s.title)}</div>
          <div class="ism-trend ${s.trend}">${s.trend === 'up' ? '↑' : s.trend === 'down' ? '↓' : '→'} ${s.trendPct != null ? Math.abs(s.trendPct) + '%' : ''}</div>
        </div>`).join('')}
      </div>
      ${buildHistoryChart(relStats[0])}`;

    renderHistoryChart(relStats[0]);
  }

  function buildHistoryChart(stat) {
    if (!stat?.history?.length) return '';
    return `
      <div class="issue-chart-wrap">
        <h4 style="font-size:var(--fs-sm);color:var(--color-text-muted);margin-bottom:var(--sp-4)">${jrEscape(stat.title)} — ${L('ऐतिहासिक रुझान','Historical Trend')}</h4>
        <canvas id="issue-stat-chart" style="max-height:240px"></canvas>
      </div>`;
  }

  function renderHistoryChart(stat) {
    if (!window.Chart || !stat?.history?.length) return;
    const ctx = document.getElementById('issue-stat-chart');
    if (!ctx) return;
    Chart.defaults.color = '#a3a1a8';
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: stat.history.map(h => h.year),
        datasets: [{
          label: stat.title,
          data: stat.history.map(h => h.value),
          borderColor: issue.color || '#c1272d',
          backgroundColor: (issue.color || '#c1272d') + '18',
          fill: true, tension: 0.4, borderWidth: 2,
          pointRadius: 4, pointBackgroundColor: issue.color || '#c1272d',
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: 'rgba(255,255,255,.06)' } }
        }
      }
    });
  }

  /* ═══════════════════════════════════════════════════
     NEWS
  ═══════════════════════════════════════════════════ */
  function buildNews() {
    const wrap = document.getElementById('sec-news');
    if (!wrap) return;
    const relNews = (issue.related_news || []).map(id => news.find(n => n.id === id)).filter(Boolean);

    // Also keyword-match additional news items
    const keywords = issue.keywords || [];
    const extra = news.filter(n => {
      if (relNews.find(r => r.id === n.id)) return false;
      return keywords.some(kw => (n.title + n.summary + n.category).toLowerCase().includes(kw));
    }).slice(0, 3);

    const allNews = [...relNews, ...extra];
    if (!allNews.length) { hideSection(wrap); return; }

    wrap.innerHTML = `
      <div class="issue-section-eyebrow"><span class="s-icon">📰</span><span class="overline">${L('ताज़ा समाचार','Latest News')}</span></div>
      <h2 class="section-title" style="font-size:var(--fs-2xl)">${L('संबंधित समाचार','Related News')}</h2>
      <div class="issue-news-list">${allNews.map(n => `
        <div class="issue-news-item">
          <span class="ini-icon">${n.icon || '📰'}</span>
          <div class="ini-body">
            <div class="ini-cat">${jrEscape(n.category || '')}</div>
            <div class="ini-title">${jrEscape(n.title || '')}</div>
            <div class="ini-meta">${jrEscape(n.source || '')} · ${jrEscape(n.date || n.published_date || '')}</div>
          </div>
        </div>`).join('')}
      </div>`;
  }

  /* ═══════════════════════════════════════════════════
     SURVEYS
  ═══════════════════════════════════════════════════ */
  function buildSurveys() {
    const wrap = document.getElementById('sec-surveys');
    if (!wrap) return;
    const relSurveys = (issue.related_surveys || []).map(id => surveys.find(s => s.id === id)).filter(Boolean);

    // Keyword-match more
    const keywords = issue.keywords || [];
    const extra = surveys.filter(s => {
      if (relSurveys.find(r => r.id === s.id)) return false;
      const cat = s.category || s.theme || '';
      return keywords.some(kw => (s.title + cat).toLowerCase().includes(kw));
    }).slice(0, 2);

    const allSurveys = [...relSurveys, ...extra];
    if (!allSurveys.length) { hideSection(wrap); return; }

    wrap.innerHTML = `
      <div class="issue-section-eyebrow"><span class="s-icon">🗳️</span><span class="overline">${L('जनमत','Public Opinion')}</span></div>
      <h2 class="section-title" style="font-size:var(--fs-2xl)">${L('संबंधित सर्वेक्षण','Related Surveys')}</h2>
      <div class="issue-survey-grid">${allSurveys.slice(0, 6).map(s => {
        const total = s.totalResponses || s.responses || 0;
        const title = (jrGetLang() === 'en' ? (s.titleEn || s.title_en || s.title) : s.title) || '';
        return `
          <div class="issue-survey-card">
            <span class="badge badge-saffron" style="font-size:10px">${jrEscape(s.category || s.theme || '')}</span>
            <div class="isc-q">${jrEscape(title)}</div>
            <div class="isc-meta">${total.toLocaleString('en-IN')} ${L('प्रतिक्रियाएँ','responses')}</div>
            <div class="isc-vote-row">
              <a href="surveys.html" class="btn btn-ghost btn-sm" style="font-size:var(--fs-xs)">🗳 ${L('मत दें','Vote')}</a>
              <a href="surveys.html" class="btn btn-ghost btn-sm" style="font-size:var(--fs-xs)">📊 ${L('परिणाम','Results')}</a>
            </div>
          </div>`;
      }).join('')}
      </div>`;
  }

  /* ═══════════════════════════════════════════════════
     STORIES
  ═══════════════════════════════════════════════════ */
  function buildStories() {
    const wrap = document.getElementById('sec-stories');
    if (!wrap) return;
    const relStories = (issue.related_stories || []).map(id => stories.find(s => s.id === id)).filter(Boolean);
    if (!relStories.length) { hideSection(wrap); return; }

    wrap.innerHTML = `
      <div class="issue-section-eyebrow"><span class="s-icon">📖</span><span class="overline">${L('कहानी संग्रह','Storybook')}</span></div>
      <h2 class="section-title" style="font-size:var(--fs-2xl)">${L('संबंधित कहानियाँ','Related Stories')}</h2>
      <div class="issue-story-strip">${relStories.map(s => `
        <div class="issue-story-card" onclick="window.location.href='storybook.html'">
          <div class="isc-emoji">${s.coverEmoji || s.emoji || '📖'}</div>
          <div class="isc-title">${jrEscape(jrGetLang() === 'en' ? (s.title_en || s.title) : s.title)}</div>
          <div class="isc-info">⏱ ${s.readingTime}${L('मि','min')} · ${s.pages?.length || 0} ${L('पन्ने','pages')}</div>
          <a href="storybook.html" class="btn btn-ghost btn-sm" style="font-size:10px;margin-top:var(--sp-3)">📖 ${L('पढ़ें','Read')}</a>
        </div>`).join('')}
      </div>`;
  }

  /* ═══════════════════════════════════════════════════
     POLITICIANS
  ═══════════════════════════════════════════════════ */
  function buildPoliticians() {
    const wrap = document.getElementById('sec-politicians');
    if (!wrap) return;
    const relPols = (issue.related_politicians || []).map(id => politicians.find(p => p.id === id)).filter(Boolean);
    if (!relPols.length) { hideSection(wrap); return; }

    wrap.innerHTML = `
      <div class="issue-section-eyebrow"><span class="s-icon">🏛️</span><span class="overline">${L('पदाधिकारी','Officials')}</span></div>
      <h2 class="section-title" style="font-size:var(--fs-2xl)">${L('संबंधित पदाधिकारी','Related Officials')}</h2>
      <div class="issue-transparency-note" style="margin-bottom:var(--sp-5)">
        ℹ️ ${L(
          'यहाँ दिखाए गए नेताओं का संबंध केवल उनके पद/पोर्टफोलियो पर आधारित है। जंगल राज किसी नेता पर किसी मुद्दे की ज़िम्मेदारी नहीं थोपता।',
          'The politicians shown here are linked only by their position/portfolio. Jungle Raj does not attribute responsibility for any issue to any politician.'
        )}
      </div>
      <div class="issue-pol-row">${relPols.map(p => `
        <a class="issue-pol-card" href="politicians.html?id=${jrEscape(p.id)}">
          <div class="ipc-avatar ${(p.gender || '').toLowerCase()}">${initials2(p.name)}</div>
          <div>
            <div class="ipc-name">${jrEscape(p.name_en || p.name)}</div>
            <div class="ipc-pos">${jrEscape(p.position || '')} · ${jrEscape(p.party || '')}</div>
            <div class="ipc-note">${jrEscape(p.ministry || p.cabinet || '')}</div>
          </div>
        </a>`).join('')}
      </div>`;
  }

  /* ═══════════════════════════════════════════════════
     OFFICIAL DOCUMENTS
  ═══════════════════════════════════════════════════ */
  function buildDocuments() {
    const wrap = document.getElementById('sec-documents');
    if (!wrap) return;
    const docs = issue.official_documents || [];
    if (!docs.length) { hideSection(wrap); return; }

    const docIcons = {
      'Parliament Act':    '⚖️',
      'Supreme Court':     '🏛️',
      'Government Report': '📋',
      'Policy Document':   '📄',
      'Parliament Questions':'🗣️',
      'Committee Report':  '📑',
      'White Paper':       '📃',
    };

    wrap.innerHTML = `
      <div class="issue-section-eyebrow"><span class="s-icon">📄</span><span class="overline">${L('आधिकारिक दस्तावेज़','Official Documents')}</span></div>
      <h2 class="section-title" style="font-size:var(--fs-2xl)">${L('सरकारी स्रोत','Government Sources')}</h2>
      <div class="issue-docs-list">${docs.map(doc => `
        <a class="issue-doc-item" href="${jrEscape(doc.url || '#')}" target="_blank" rel="noopener">
          <span class="doc-type-badge"><span class="badge">${docIcons[doc.type] || '📄'} ${jrEscape(doc.type)}</span></span>
          <div>
            <div class="doc-title">${jrEscape(doc.title)}</div>
            <div class="doc-date">📅 ${jrEscape(doc.date || '')} · ${jrEscape(doc.url ? new URL(doc.url).hostname : '')}</div>
          </div>
        </a>`).join('')}
      </div>`;
  }

  /* ═══════════════════════════════════════════════════
     FAQ
  ═══════════════════════════════════════════════════ */
  function buildFAQ() {
    const wrap = document.getElementById('sec-faq');
    if (!wrap) return;
    const faq = issue.faq || [];
    if (!faq.length) { hideSection(wrap); return; }

    wrap.innerHTML = `
      <div class="issue-section-eyebrow"><span class="s-icon">❓</span><span class="overline">${L('अक्सर पूछे जाने वाले प्रश्न','Frequently Asked Questions')}</span></div>
      <h2 class="section-title" style="font-size:var(--fs-2xl)">FAQ</h2>
      <div class="faq-list">${faq.map((f, i) => `
        <div class="faq-item" id="faq-${i}">
          <button class="faq-question" aria-expanded="false" data-faq="${i}">
            <span>${jrEscape(f.q_hi || f.q)}</span>
            <span class="faq-arrow">▾</span>
          </button>
          <div class="faq-answer">
            ${f.a_hi ? `<p>${jrEscape(f.a_hi)}</p>` : ''}
            ${f.a ? `<div class="faq-answer-hi">${jrEscape(f.a)}</div>` : ''}
          </div>
        </div>`).join('')}
      </div>`;
  }

  function wireAccordion() {
    document.querySelectorAll('[data-faq]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        const wasOpen = item.classList.contains('open');
        document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
        if (!wasOpen) item.classList.add('open');
        btn.setAttribute('aria-expanded', String(!wasOpen));
      });
    });
  }

  /* ═══════════════════════════════════════════════════
     PUBLIC OPINION (from surveys)
  ═══════════════════════════════════════════════════ */
  function buildPublicOpinion() {
    // Handled in surveys section — no separate section needed for MVP
  }

  /* ═══════════════════════════════════════════════════
     RELATED ISSUES
  ═══════════════════════════════════════════════════ */
  function buildRelatedIssues() {
    const wrap = document.getElementById('sec-related');
    if (!wrap) return;
    const relIds = issue.related_issues || [];
    const related = relIds.map(id => allIssues.find(i => i.id === id)).filter(Boolean);
    if (!related.length) { hideSection(wrap); return; }

    wrap.innerHTML = `
      <div class="issue-section-eyebrow"><span class="s-icon">🔗</span><span class="overline">${L('देखें और','See Also')}</span></div>
      <h2 class="section-title" style="font-size:var(--fs-2xl)">${L('संबंधित मुद्दे','Related Issues')}</h2>
      <div class="related-issues-grid">${related.map(r => `
        <a class="related-issue-pill" href="issue-details.html?id=${jrEscape(r.id)}">
          <span>${r.icon}</span>
          <span>${jrEscape(r.title)}</span>
          <span class="badge badge-saffron" style="font-size:10px">${jrEscape(r.category)}</span>
        </a>`).join('')}
      </div>`;
  }

  /* ── Helpers ────────────────────────────────────── */
  function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val || ''; }
  function hideSection(el)  { if (el) el.style.display = 'none'; }
  function initials2(name)  { const p = (name||'').trim().split(/\s+/); return (p[0][0] + (p[1]?.[0] || '')).toUpperCase(); }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => IssueDetail.init());
