/* =========================================================
   search.js — Global Intelligence Search System  Phase 8
   Features:
     • Indexes all 6 JSON datasets at first open
     • Instant (~0ms) client-side search with typo tolerance
     • Groups by type: Politicians / Issues / Statistics /
       Surveys / Stories / News
     • Keyboard: Ctrl+K open, ↑↓ navigate, Enter go, Esc close
     • LocalStorage: 10 recent searches
     • Web Speech API voice search
     • Bilingual matching (Hindi + English)
     • URL: search.html?q=… for shareable searches
   ========================================================= */
'use strict';

const JrSearch = (() => {
  /* ── State ───────────────────────────────────────────── */
  const S = {
    index: [],           // flat search index, built from all JSONs
    loaded: false,
    loading: false,
    query: '',
    results: [],
    focusedIdx: -1,      // index into flat rendered result list
    resultEls: [],       // NodeList of focusable result items
    recent: [],          // from localStorage
    voice: null,         // SpeechRecognition instance
    listening: false,
    overlay: null,
    input: null,
  };

  const RECENTS_KEY  = 'jungleraj_search_recent';
  const MAX_RECENTS  = 10;
  const MAX_PER_GROUP = 5;

  /* ── Group definitions ───────────────────────────────── */
  const GROUPS = [
    { type: 'politician', label: 'नेतागण',      labelEn: 'Politicians', icon: '🏛️', color: '#2255a4' },
    { type: 'issue',      label: 'मुद्दे',      labelEn: 'Issues',      icon: '🔍', color: '#c1272d' },
    { type: 'statistic',  label: 'आँकड़े',      labelEn: 'Statistics',  icon: '📊', color: '#ff9933' },
    { type: 'survey',     label: 'सर्वेक्षण',   labelEn: 'Surveys',     icon: '🗳️', color: '#128807' },
    { type: 'story',      label: 'कहानियाँ',    labelEn: 'Stories',     icon: '📖', color: '#a78bfa' },
    { type: 'news',       label: 'समाचार',      labelEn: 'News',        icon: '📰', color: '#0d9488' },
  ];

  const TRENDING = [
    'पेपर लीक','बेरोज़गारी','पेट्रोल','किसान','न्यायपालिका',
    'GDP','UPI','महिला सुरक्षा','शिक्षा','साइबर अपराध'
  ];

  /* ══════════════════════════════════════════════════════
     INIT — called by main.js once DOM is ready
  ══════════════════════════════════════════════════════ */
  function init() {
    S.overlay = document.getElementById('search-overlay');
    S.input   = document.getElementById('search-overlay-input');
    if (!S.overlay || !S.input) return;

    loadRecents();
    wireOverlayEvents();
    wireKeyboard();
    wireSearchButton();
    initVoice();
  }

  /* ── Wire overlay events ─────────────────────────────── */
  function wireOverlayEvents() {
    const overlay = S.overlay;

    // Close on backdrop click
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close();
    });

    // Close button
    document.getElementById('search-close-btn')?.addEventListener('click', close);

    // Input
    S.input.addEventListener('input', () => {
      S.query = S.input.value.trim();
      if (S.query.length >= 1) {
        if (S.loaded) renderResults(search(S.query));
        else { renderLoading(); ensureIndex().then(() => renderResults(search(S.query))); }
      } else {
        renderDefaultPanel();
      }
    });

    // Voice btn
    document.getElementById('search-voice-btn')?.addEventListener('click', toggleVoice);

    // Clear recents
    overlay.addEventListener('click', e => {
      if (e.target.classList.contains('search-panel-clear')) {
        S.recent = [];
        saveRecents();
        renderDefaultPanel();
      }
    });

    // Quick items (recent / trending)
    overlay.addEventListener('click', e => {
      const qi = e.target.closest('.search-quick-item, .search-quick-pill');
      if (qi) {
        const term = qi.dataset.term;
        if (term) { S.input.value = term; S.input.dispatchEvent(new Event('input')); }
      }
    });
  }

  /* ── Keyboard navigation ─────────────────────────────── */
  function wireKeyboard() {
    document.addEventListener('keydown', e => {
      // Ctrl+K / Cmd+K opens search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        isOpen() ? close() : open();
        return;
      }
      if (!isOpen()) return;

      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); moveFocus(-1); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (S.focusedIdx >= 0 && S.resultEls[S.focusedIdx]) {
          S.resultEls[S.focusedIdx].click();
        } else if (S.query) {
          navigateToSearchPage(S.query);
        }
        return;
      }
      if (e.key === 'Tab') { e.preventDefault(); moveFocus(e.shiftKey ? -1 : 1); }
    });

    // Input keydown (for Enter on input)
    S.input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.repeat) {
        const focused = S.resultEls[S.focusedIdx];
        if (focused) focused.click();
        else if (S.query) navigateToSearchPage(S.query);
      }
    });
  }

  function moveFocus(delta) {
    S.resultEls = Array.from(S.overlay.querySelectorAll('.search-result-item, .search-quick-item'));
    if (!S.resultEls.length) return;
    S.resultEls.forEach(el => el.classList.remove('focused'));
    S.focusedIdx = (S.focusedIdx + delta + S.resultEls.length) % S.resultEls.length;
    const el = S.resultEls[S.focusedIdx];
    el.classList.add('focused');
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function wireSearchButton() {
    // Both index.html and pages/* have .search-trigger-btn
    document.querySelectorAll('.search-trigger-btn').forEach(btn => {
      btn.addEventListener('click', open);
    });
  }

  /* ══════════════════════════════════════════════════════
     OPEN / CLOSE
  ══════════════════════════════════════════════════════ */
  function open() {
    S.overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    S.focusedIdx = -1;
    S.input.value = S.query = '';
    renderDefaultPanel();
    requestAnimationFrame(() => S.input.focus());
    // Pre-load index in background
    if (!S.loaded && !S.loading) ensureIndex();
  }

  function close() {
    S.overlay.classList.remove('open');
    document.body.style.overflow = '';
    S.focusedIdx = -1;
    stopVoice();
  }

  function isOpen() { return S.overlay.classList.contains('open'); }

  /* ══════════════════════════════════════════════════════
     INDEX BUILDER
  ══════════════════════════════════════════════════════ */
  async function ensureIndex() {
    if (S.loaded || S.loading) return;
    S.loading = true;
    try {
      const [surveys, statistics, stories, news, politicians, issues] = await Promise.all([
        jrLoadData('surveys.json').catch(() => []),
        jrLoadData('statistics.json').catch(() => []),
        jrLoadData('stories.json').catch(() => []),
        jrLoadData('news.json').catch(() => []),
        jrLoadData('politicians.json').catch(() => []),
        jrLoadData('issues.json').catch(() => []),
      ]);

      const index = [];

      politicians.forEach(p => index.push({
        type: 'politician',
        id: p.id,
        title: p.name_hi || p.name || '',
        title_en: p.name_en || p.name || '',
        sub: [p.party, p.state, p.position_hi || p.position].filter(Boolean).join(' · '),
        cat: p.party || 'Politician',
        badge: p.state || '',
        icon: '🏛️',
        url: 'pages/politicians.html',
        tokens: tokenize([p.name, p.name_hi, p.name_en, p.party, p.state, p.position, p.position_hi].join(' ')),
      }));

      issues.forEach(i => index.push({
        type: 'issue',
        id: i.id,
        title: i.title_hi || i.title || '',
        title_en: i.title || '',
        sub: i.summary || '',
        cat: i.category || 'Issue',
        badge: '',
        icon: '🔍',
        url: `pages/issue-details.html?id=${i.id}`,
        tokens: tokenize([i.title, i.title_hi, i.category, i.summary, i.tags?.join(' ')].join(' ')),
      }));

      statistics.forEach(s => index.push({
        type: 'statistic',
        id: s.id,
        title: s.title || '',
        title_en: s.title_en || '',
        sub: s.description || '',
        cat: s.category || 'Statistics',
        badge: s.value || '',
        icon: s.icon || '📊',
        url: 'pages/statistics.html',
        tokens: tokenize([s.title, s.title_en, s.category, s.description, s.source].join(' ')),
      }));

      surveys.forEach(s => index.push({
        type: 'survey',
        id: s.id,
        title: s.title || '',
        title_en: s.title_en || s.titleEn || '',
        sub: s.description || s.description_en || '',
        cat: s.category || 'Survey',
        badge: (s.responses || s.totalResponses || 0).toLocaleString('en-IN') + ' votes',
        icon: '🗳️',
        url: 'pages/surveys.html',
        tokens: tokenize([s.title, s.title_en || s.titleEn, s.category, s.description].join(' ')),
      }));

      stories.filter(s => s.active === true).forEach(s => index.push({
        type: 'story',
        id: s.id,
        title: s.title || '',
        title_en: s.title_en || s.titleEn || '',
        sub: s.subtitle || s.subtitle_en || '',
        cat: s.theme || s.category || 'Story',
        badge: s.pages ? `${s.pages} pages` : '',
        icon: s.emoji || '📖',
        url: 'pages/storybook.html',
        tokens: tokenize([s.title, s.title_en || s.titleEn, s.subtitle, s.theme, s.category].join(' ')),
      }));

      news.forEach(n => index.push({
        type: 'news',
        id: n.id,
        title: n.title || '',
        title_en: n.title_en || '',
        sub: n.summary || n.summary_en || '',
        cat: n.category || 'News',
        badge: n.date || '',
        icon: n.icon || '📰',
        url: 'pages/news.html',
        tokens: tokenize([n.title, n.title_en, n.category, n.summary, n.tags?.join(' ')].join(' ')),
      }));

      S.index = index;
      S.loaded = true;
    } catch (err) {
      console.warn('[JrSearch] index build failed:', err);
    }
    S.loading = false;
  }

  /* ── Tokenizer ────────────────────────────────────────── */
  function tokenize(str) {
    if (!str) return [];
    return str.toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s]/g, ' ').split(/\s+/).filter(Boolean);
  }

  /* ══════════════════════════════════════════════════════
     SEARCH ENGINE
  ══════════════════════════════════════════════════════ */
  function search(rawQuery) {
    if (!rawQuery || !S.index.length) return [];
    const q = rawQuery.toLowerCase().trim();
    const qTokens = tokenize(q);
    if (!qTokens.length) return [];

    const scored = S.index.map(doc => {
      let score = 0;
      const titleL = (doc.title + ' ' + doc.title_en).toLowerCase();
      const subL   = doc.sub.toLowerCase();
      const catL   = doc.cat.toLowerCase();

      // Exact title match — very high
      if (titleL === q) score += 100;
      // Starts with query
      if (titleL.startsWith(q)) score += 50;
      // Title contains query
      if (titleL.includes(q)) score += 30;
      // Category match
      if (catL.includes(q)) score += 20;
      // Sub contains query
      if (subL.includes(q)) score += 10;

      // Token matching
      for (const tok of qTokens) {
        if (tok.length < 2) continue;
        for (const docTok of doc.tokens) {
          if (docTok === tok)             score += 8;  // exact token
          else if (docTok.startsWith(tok)) score += 5; // prefix
          else if (docTok.includes(tok))   score += 2; // substring
          // Typo tolerance: Levenshtein <= 1 for tokens >= 5 chars
          else if (tok.length >= 5 && levenshtein(tok, docTok) <= 1) score += 3;
        }
      }

      return { doc, score };
    });

    return scored.filter(r => r.score > 0).sort((a,b) => b.score - a.score);
  }

  /* ── Levenshtein distance (simple) ───────────────────── */
  function levenshtein(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 99;
    const m = a.length, n = b.length;
    const dp = Array.from({length: m+1}, (_, i) => Array.from({length: n+1}, (_, j) => i === 0 ? j : j === 0 ? i : 0));
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
    return dp[m][n];
  }

  /* ── Highlight query in text ─────────────────────────── */
  function highlight(text, query) {
    if (!query || !text) return jrEscape(text || '');
    const escaped = jrEscape(text);
    const q = jrEscape(query.trim());
    if (!q) return escaped;
    try {
      const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      return escaped.replace(re, '<mark>$1</mark>');
    } catch { return escaped; }
  }

  /* ══════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════ */
  function getResultsEl() { return document.getElementById('search-results'); }

  function renderLoading() {
    const el = getResultsEl(); if (!el) return;
    el.innerHTML = `<div class="search-loading">
      <div class="search-loading-dots"><span></span><span></span><span></span></div>
      <span>डेटा लोड हो रहा है…</span>
    </div>`;
  }

  function renderDefaultPanel() {
    const el = getResultsEl(); if (!el) return;
    const lang = jrGetLang();
    let html = '';

    // Recent searches
    if (S.recent.length) {
      html += `<div class="search-panel">
        <div class="search-panel-header">
          <span class="search-panel-title">हालिया खोजें</span>
          <span class="search-panel-clear">साफ़ करें</span>
        </div>
        <div class="search-panel-items">
          ${S.recent.slice(0,6).map(r => `
            <div class="search-quick-item" data-term="${jrEscape(r)}">
              <span class="search-quick-icon">🕐</span>
              <span>${jrEscape(r)}</span>
            </div>`).join('')}
        </div>
      </div>`;
    }

    // Trending
    html += `<div class="search-panel">
      <div class="search-panel-header">
        <span class="search-panel-title">🔥 ट्रेंडिंग विषय</span>
      </div>
      <div class="search-panel-items" style="flex-direction:row;flex-wrap:wrap;padding:var(--sp-3) var(--sp-4)">
        ${TRENDING.map(t => `<span class="search-quick-pill" data-term="${jrEscape(t)}">${jrEscape(t)}</span>`).join('')}
      </div>
    </div>`;

    el.innerHTML = html;
  }

  function renderResults(scored) {
    const el = getResultsEl(); if (!el) return;
    S.focusedIdx = -1;

    if (!scored.length) {
      el.innerHTML = `<div class="search-empty">
        <div class="search-empty-icon">🔎</div>
        <div class="search-empty-title">कोई परिणाम नहीं मिला</div>
        <div class="search-empty-sub">"${jrEscape(S.query)}" के लिए कोई परिणाम नहीं। कोई और शब्द आज़माएँ।</div>
      </div>`;
      return;
    }

    // Group results
    const groups = {};
    for (const r of scored) {
      const t = r.doc.type;
      if (!groups[t]) groups[t] = [];
      if (groups[t].length < MAX_PER_GROUP) groups[t].push(r);
    }

    const total = scored.length;
    let html = `<div class="search-summary">
      <strong>${total}</strong> परिणाम मिले "<strong>${jrEscape(S.query)}</strong>" के लिए
    </div>`;

    for (const grp of GROUPS) {
      const items = groups[grp.type];
      if (!items?.length) continue;
      const lang = jrGetLang();
      html += `<div class="search-group">
        <div class="search-group-header">
          <span class="search-group-icon">${grp.icon}</span>
          <span class="search-group-label">${lang === 'en' ? grp.labelEn : grp.label}</span>
          <span class="search-group-count">${items.length}</span>
        </div>
        ${items.map(r => resultItemHtml(r.doc, S.query, grp)).join('')}
      </div>`;
    }

    el.innerHTML = html;

    // Wire click handlers
    el.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.dataset.url;
        const term = item.dataset.term;
        if (term) addRecent(term);
        if (url) { close(); window.location.href = resolveUrl(url); }
      });
    });

    S.resultEls = Array.from(el.querySelectorAll('.search-result-item'));
  }

  function resultItemHtml(doc, query, grp) {
    const lang  = jrGetLang();
    const title = lang === 'en' ? (doc.title_en || doc.title) : (doc.title || doc.title_en);
    return `
    <div class="search-result-item" data-url="${jrEscape(doc.url)}" data-term="${jrEscape(doc.title)}" tabindex="0" role="button">
      <div class="sri-thumb">${doc.icon}</div>
      <div class="sri-body">
        <div class="sri-title">${highlight(title, query)}</div>
        <div class="sri-meta">
          <span class="sri-cat">${jrEscape(doc.cat)}</span>
          ${doc.sub ? `<span class="sri-sub">${jrEscape(doc.sub.substring(0, 80))}</span>` : ''}
        </div>
      </div>
      ${doc.badge ? `<span class="sri-badge">${jrEscape(String(doc.badge).substring(0,20))}</span>` : ''}
      <span class="sri-arrow">→</span>
    </div>`;
  }

  /* ── URL resolver (handles root vs /pages/) ──────────── */
  function resolveUrl(url) {
    const isPages = window.location.pathname.includes('/pages/');
    if (isPages && url.startsWith('pages/')) return '../' + url;
    return url;
  }

  /* ══════════════════════════════════════════════════════
     RECENTS (localStorage)
  ══════════════════════════════════════════════════════ */
  function loadRecents() {
    try { S.recent = JSON.parse(localStorage.getItem(RECENTS_KEY)) || []; } catch { S.recent = []; }
  }
  function saveRecents() {
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(S.recent)); } catch {}
  }
  function addRecent(term) {
    if (!term) return;
    S.recent = [term, ...S.recent.filter(r => r !== term)].slice(0, MAX_RECENTS);
    saveRecents();
  }

  /* ══════════════════════════════════════════════════════
     VOICE SEARCH
  ══════════════════════════════════════════════════════ */
  function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      document.getElementById('search-voice-btn')?.style?.setProperty('display', 'none');
      return;
    }
    const r = new SR();
    r.lang = jrGetLang() === 'en' ? 'en-IN' : 'hi-IN';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = e => {
      const t = e.results[0][0].transcript;
      S.input.value = t;
      S.query = t;
      S.input.dispatchEvent(new Event('input'));
    };
    r.onend = () => { S.listening = false; updateVoiceBtn(); };
    r.onerror = () => { S.listening = false; updateVoiceBtn(); };
    S.voice = r;
  }

  function toggleVoice() {
    if (!S.voice) return;
    if (S.listening) stopVoice();
    else {
      try { S.voice.start(); S.listening = true; updateVoiceBtn(); } catch {}
    }
  }
  function stopVoice() {
    if (S.voice && S.listening) { try { S.voice.stop(); } catch {} }
    S.listening = false;
    updateVoiceBtn();
  }
  function updateVoiceBtn() {
    document.getElementById('search-voice-btn')?.classList?.toggle('listening', S.listening);
  }

  /* ══════════════════════════════════════════════════════
     SEARCH PAGE (pages/search.html) support
  ══════════════════════════════════════════════════════ */
  function initSearchPage() {
    const pageInput = document.getElementById('search-page-input');
    const pageResults = document.getElementById('search-page-results');
    if (!pageInput || !pageResults) return;

    // Read URL param
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q') || '';
    if (q) {
      pageInput.value = q;
      ensureIndex().then(() => {
        const results = search(q);
        pageResults.innerHTML = buildPageResults(results, q);
        wirePageResultClicks(pageResults);
      });
    }

    // Live search on page
    let debounceT;
    pageInput.addEventListener('input', () => {
      clearTimeout(debounceT);
      debounceT = setTimeout(() => {
        const qv = pageInput.value.trim();
        const url = new URL(window.location);
        if (qv) url.searchParams.set('q', qv);
        else url.searchParams.delete('q');
        window.history.replaceState({}, '', url);
        ensureIndex().then(() => {
          const results = search(qv);
          pageResults.innerHTML = qv ? buildPageResults(results, qv) : '';
          wirePageResultClicks(pageResults);
        });
      }, 250);
    });
  }

  function buildPageResults(scored, query) {
    if (!scored.length) return `<div class="search-empty"><div class="search-empty-icon">🔎</div><div class="search-empty-title">कोई परिणाम नहीं</div><div class="search-empty-sub">अलग शब्द आज़माएँ।</div></div>`;
    const groups = {};
    for (const r of scored) {
      const t = r.doc.type;
      if (!groups[t]) groups[t] = [];
      if (groups[t].length < MAX_PER_GROUP * 2) groups[t].push(r);
    }
    let html = `<p class="search-summary"><strong>${scored.length}</strong> परिणाम मिले</p>`;
    for (const grp of GROUPS) {
      const items = groups[grp.type];
      if (!items?.length) continue;
      html += `<div class="search-group" style="margin-bottom:var(--sp-5)">
        <div class="search-group-header">
          <span class="search-group-icon">${grp.icon}</span>
          <span class="search-group-label">${grp.label}</span>
          <span class="search-group-count">${items.length}</span>
        </div>
        ${items.map(r => resultItemHtml(r.doc, query, grp)).join('')}
      </div>`;
    }
    return html;
  }

  function wirePageResultClicks(container) {
    container.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.dataset.url;
        const term = item.dataset.term;
        if (term) addRecent(term);
        if (url) window.location.href = url;
      });
    });
  }

  function navigateToSearchPage(query) {
    const isPages = window.location.pathname.includes('/pages/');
    const base = isPages ? 'search.html' : 'pages/search.html';
    window.location.href = `${base}?q=${encodeURIComponent(query)}`;
  }

  /* ── Public API ──────────────────────────────────────── */
  return { init, open, close, initSearchPage };
})();

document.addEventListener('DOMContentLoaded', () => {
  JrSearch.init();
  JrSearch.initSearchPage();
});
