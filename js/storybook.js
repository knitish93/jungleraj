/* =========================================================
   STORYBOOK MODULE — Phase 3 complete engine
   ========================================================= */

'use strict';

const Storybook = (() => {

  /* ── State ──────────────────────────────────────────── */
  let stories      = [];
  let activeStory  = null;
  let currentPage  = 0;
  let isAnimating  = false;

  // Reader settings (persisted) — content language is intentionally NOT part
  // of this object. It's driven by the site-wide jrGetLang()/jrSetLang() (see
  // js/i18n.js) so Storybook always matches the same hi/en selector as the
  // rest of the app, instead of keeping its own separate language state.
  let settings = JSON.parse(localStorage.getItem('sb_settings') || JSON.stringify({
    theme: 'dark',
    fontSize: 17,
    fontFamily: 'default',
    lineHeight: 1.85,
    narrationSpeed: 1,
    music: false
  }));

  // Progress & bookmarks (persisted)
  let progress  = JSON.parse(localStorage.getItem('sb_progress')  || '{}');
  let bookmarks = JSON.parse(localStorage.getItem('sb_bookmarks') || '{}');

  // Narration state
  let narration = { synth: null, utterance: null, playing: false, autoNext: true };

  // Music
  let musicCtx = null, musicNode = null;

  /* ── DOM refs (populated on init) ─────────────────── */
  let DOM = {};

  /* ═══════════════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════════════ */
  async function init() {
    cacheDOM();
    if (!DOM.root) return;
    await loadStories();
    buildShelf();
    wireEvents();
    updateLangToggleLabel();

    // React to the site-wide language toggle (same event the rest of the
    // app uses) — refresh the shelf, and the open reader if one is active.
    document.addEventListener('jr:langchange', () => {
      buildShelf();
      updateLangToggleLabel();
      if (DOM.overlay?.classList.contains('open') && activeStory) {
        updateReaderTitle();
        renderPage();
        updateNarrationBtn();
      }
    });
    applySettings(false);
  }

  function cacheDOM() {
    DOM.root            = document.getElementById('sb-root');
    DOM.heroSearchInput = document.getElementById('sb-search');
    DOM.categoryStrip   = document.getElementById('sb-categories');
    DOM.featuredWrap    = document.getElementById('sb-featured');
    DOM.trendingGrid    = document.getElementById('sb-trending');
    DOM.recentGrid      = document.getElementById('sb-recent');
    DOM.bookmarkGrid    = document.getElementById('sb-bookmarks');
    DOM.continueGrid    = document.getElementById('sb-continue');
    DOM.bookmarkSect    = document.getElementById('sb-bookmark-section');
    DOM.continueSect    = document.getElementById('sb-continue-section');
    DOM.overlay         = document.getElementById('sb-reader');
    DOM.progressFill    = document.getElementById('sb-progress-fill');
    DOM.storyTitle      = document.getElementById('sb-reader-title');
    DOM.stage           = document.getElementById('sb-stage');
    DOM.endPanel        = document.getElementById('sb-end-panel');
    DOM.pageCounter     = document.getElementById('sb-page-counter');
    DOM.timeLeft        = document.getElementById('sb-time-left');
    DOM.prevBtn         = document.getElementById('sb-prev');
    DOM.nextBtn         = document.getElementById('sb-next');
    DOM.closeBtn        = document.getElementById('sb-close');
    DOM.bookmarkBtn     = document.getElementById('sb-bookmark-btn');
    DOM.shareBtn        = document.getElementById('sb-share-btn');
    DOM.fullscreenBtn   = document.getElementById('sb-fullscreen-btn');
    DOM.settingsBtn     = document.getElementById('sb-settings-btn');
    DOM.narrationBtn    = document.getElementById('sb-narration-btn');
    DOM.settingsPanel   = document.getElementById('sb-settings-panel');
    DOM.narrationPanel  = document.getElementById('sb-narration-panel');
    DOM.langToggle      = document.getElementById('sb-lang-toggle');
    DOM.narrationPlay   = document.getElementById('sb-narration-play');
    DOM.narrationLabel  = document.querySelector('.narration-label');
    DOM.narrationVoice  = document.getElementById('sb-voice-select');
    DOM.narrationSpeed  = document.getElementById('sb-narration-speed');
    DOM.narrationSpeedVal = document.getElementById('sb-narration-speed-val');
    DOM.musicToggle     = document.getElementById('sb-music-toggle');
  }

  /* ── Load JSON ─────────────────────────────────────── */
  async function loadStories() {
    const base = window.location.pathname.includes('/pages/') ? '../' : '';
    const resp = await fetch(`${base}data/stories.json`);
    const all = await resp.json();
    // Only stories explicitly marked active are public; the rest stay in the
    // data file (not deleted) for a later release.
    stories = all.filter(s => s.active === true);
  }

  /* ═══════════════════════════════════════════════════
     SHELF BUILDER
  ═══════════════════════════════════════════════════ */
  function buildShelf() {
    buildCategories();
    buildFeatured();
    buildGrid(DOM.trendingGrid, stories.filter(s => s.trending).slice(0, 6));
    buildGrid(DOM.recentGrid,   stories.slice(-6).reverse());
    buildContinue();
    buildBookmarkSection();
    updateShelfCounts();
  }

  const ALL_CAT = '__ALL__'; // language-independent sentinel; display text is localized separately

  function buildCategories() {
    if (!DOM.categoryStrip) return;
    const cats = [ALL_CAT, ...new Set(stories.map(s => s.category))];
    DOM.categoryStrip.innerHTML = cats.map(c =>
      `<button class="chip ${c === ALL_CAT ? 'active' : ''}" data-cat="${c}">${c === ALL_CAT ? jrT('common.all') : c}</button>`
    ).join('');
    DOM.categoryStrip.addEventListener('click', e => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      DOM.categoryStrip.querySelectorAll('[data-cat]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.dataset.cat;
      const filtered = cat === ALL_CAT ? stories : stories.filter(s => s.category === cat);
      buildGrid(DOM.trendingGrid, filtered.slice(0, 6));
    });
  }

  function buildFeatured() {
    if (!DOM.featuredWrap) return;
    const s = stories.find(s => s.featured) || stories[0];
    const lang = jrGetLang();
    const prog = progress[s.id] || {};
    DOM.featuredWrap.innerHTML = `
      <div class="featured-card" data-id="${s.id}">
        <div class="featured-cover" style="background:${s.coverColor}22">
          <span style="font-size:6rem">${s.coverEmoji}</span>
        </div>
        <div class="featured-body">
          <div class="featured-label">${jrT('storybook.featuredLabel', lang)}</div>
          <h2 class="featured-title">${lang === 'hi' ? s.title : s.title_en}</h2>
          <p class="featured-sub">${lang === 'hi' ? s.subtitle : s.subtitle_en}</p>
          <div class="featured-footer">
            <span class="badge badge-saffron">${s.category}</span>
            <span class="read-time-badge">⏱ ${s.readingTime} ${jrT('storybook.minutesUnit', lang)}</span>
            <span class="read-time-badge">📖 ${s.pages.length} ${jrT('storybook.pagesUnit', lang)}</span>
            ${prog.page ? `<span class="badge badge-green">${jrT('storybook.continueReading', lang)} — ${jrT('common.page', lang)} ${prog.page + 1}</span>` : ''}
          </div>
          <div style="display:flex;gap:var(--sp-3);flex-wrap:wrap">
            <button class="btn btn-primary" data-id="${s.id}">${jrT('storybook.readStory', lang)}</button>
          </div>
        </div>
      </div>`;
    DOM.featuredWrap.addEventListener('click', handleCardClick);
  }

  function buildGrid(el, list) {
    if (!el) return;
    el.innerHTML = list.map(s => storyCard(s)).join('');
    el.addEventListener('click', handleCardClick);
  }

  function buildContinue() {
    const cont = stories.filter(s => progress[s.id] && progress[s.id].page > 0 && progress[s.id].page < s.pages.length - 1);
    if (!cont.length) { if (DOM.continueSect) DOM.continueSect.style.display = 'none'; return; }
    if (DOM.continueSect) DOM.continueSect.style.display = '';
    if (DOM.continueGrid) {
      DOM.continueGrid.innerHTML = cont.slice(0, 4).map(s => storyCard(s, true)).join('');
      DOM.continueGrid.addEventListener('click', handleCardClick);
    }
  }

  function buildBookmarkSection() {
    const bm = stories.filter(s => bookmarks[s.id]);
    if (!bm.length) { if (DOM.bookmarkSect) DOM.bookmarkSect.style.display = 'none'; return; }
    if (DOM.bookmarkSect) DOM.bookmarkSect.style.display = '';
    if (DOM.bookmarkGrid) {
      DOM.bookmarkGrid.innerHTML = bm.map(s => storyCard(s)).join('');
      DOM.bookmarkGrid.addEventListener('click', handleCardClick);
    }
  }

  function storyCard(s, showProgress) {
    const lang = jrGetLang();
    const prog = progress[s.id] || {};
    const progPct = prog.page ? Math.round((prog.page / s.pages.length) * 100) : 0;
    const bm = bookmarks[s.id] ? '🔖' : '';
    return `
      <div class="shelf-card" data-id="${s.id}">
        ${prog.page && showProgress ? `<div class="progress-indicator" style="width:${progPct}%"></div>` : ''}
        ${bm ? `<div class="bookmark-badge">${bm}</div>` : ''}
        <div class="shelf-card-cover" style="background:${s.coverColor}22">
          <span>${s.coverEmoji}</span>
        </div>
        <div class="shelf-card-body">
          <div class="shelf-card-title">${lang === 'hi' ? s.title : s.title_en}</div>
          <div class="shelf-card-sub">${lang === 'hi' ? s.subtitle : s.subtitle_en}</div>
          <div class="shelf-card-meta">
            <span>⏱ ${s.readingTime}${jrT('storybook.minutesUnit', lang)}</span>
            <span>${s.pages.length}📄</span>
            ${prog.page ? `<span style="color:var(--color-green)">${progPct}%</span>` : ''}
          </div>
        </div>
      </div>`;
  }

  function handleCardClick(e) {
    const card = e.target.closest('[data-id]');
    if (card) openStory(card.dataset.id);
  }

  function updateShelfCounts() {
    const el = document.getElementById('sb-count');
    if (el) el.textContent = stories.length;
  }

  /* ── Search ──────────────────────────────────────── */
  function wireSearch() {
    if (!DOM.heroSearchInput) return;
    DOM.heroSearchInput.addEventListener('input', debounce(() => {
      const q = DOM.heroSearchInput.value.toLowerCase().trim();
      if (!q) { buildGrid(DOM.trendingGrid, stories.filter(s => s.trending).slice(0, 6)); return; }
      const results = stories.filter(s =>
        s.title.includes(q) || s.title_en.toLowerCase().includes(q) ||
        s.tags.some(t => t.includes(q)) || s.category.toLowerCase().includes(q)
      );
      buildGrid(DOM.trendingGrid, results.slice(0, 12));
    }, 250));
  }

  /* ═══════════════════════════════════════════════════
     READER
  ═══════════════════════════════════════════════════ */
  function openStory(id) {
    activeStory = stories.find(s => s.id === id);
    if (!activeStory) return;
    currentPage = (progress[id] && progress[id].page) ? progress[id].page : 0;
    stopNarration();
    DOM.overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    updateReaderTitle();
    renderPage();
    applySettings(false);
  }

  function closeStory() {
    stopNarration();
    stopMusic();
    DOM.overlay.classList.remove('open');
    document.body.style.overflow = '';
    // Refresh bookmark/continue sections
    buildContinue();
    buildBookmarkSection();
  }

  function renderPage(dir) {
    if (!activeStory) return;
    const total = activeStory.pages.length;

    DOM.endPanel.classList.remove('show');
    DOM.stage.querySelectorAll('.reader-page').forEach(el => el.remove());

    const pageData = activeStory.pages[currentPage];
    const lang     = jrGetLang();
    const text     = lang === 'hi' ? pageData.text : (pageData.text_en || pageData.text);
    // Page-level headings only ever exist in Hindi in the data. Rather than
    // show the Hindi heading under an English reader (or invent a
    // translation), fall back to a neutral "Chapter N" label when no
    // title_en is present.
    const title    = lang === 'hi' ? pageData.title : (pageData.title_en || `Chapter ${currentPage + 1}`);

    // Wrap sentences for narration highlighting
    const spans = wrapSentences(text);

    const pageEl = document.createElement('div');
    pageEl.className = 'reader-page';
    pageEl.innerHTML = `
      <div class="page-eyebrow">पन्ना ${currentPage + 1} / ${total}</div>
      <h3 class="page-title">${title}</h3>
      <div class="page-illustration" role="img" aria-label="${title}">${pageData.illustration}</div>
      <div class="page-text" id="sb-page-text">${spans}</div>
      <div class="page-number">${currentPage + 1} / ${total}</div>`;
    DOM.stage.appendChild(pageEl);

    // Animate
    if (dir) {
      pageEl.classList.add(`flip-in-${dir}`);
      requestAnimationFrame(() => pageEl.offsetHeight); // force reflow
    }

    updateProgress();
    updateNavButtons();
    saveProgress();
  }

  function wrapSentences(text) {
    // Wrap each sentence in a span for narration highlight
    const sentences = text.match(/[^।\.!\?]+[।\.!\?]*/g) || [text];
    return sentences.map((s, i) =>
      `<span class="sb-sent" data-idx="${i}">${s}</span>`
    ).join('');
  }

  function flipPage(dir) {
    if (isAnimating || !activeStory) return;
    const total = activeStory.pages.length;
    const nextIdx = dir === 'next' ? currentPage + 1 : currentPage - 1;

    // Hard boundary guard: blocks first/last page regardless of whether this
    // call came from a button, keyboard arrow, or swipe gesture.
    if (nextIdx < 0 || nextIdx > total - 1) return;

    isAnimating = true;
    stopNarration();

    const pageEl = DOM.stage.querySelector('.reader-page');
    if (pageEl) {
      // This element still carries its entrance class (flip-in-next/prev,
      // added in renderPage() and never cleared). Since .flip-in-* is
      // declared after .flip-out-* in storybook.css, leaving it in place
      // would win the cascade and keep the computed animation-name
      // unchanged — so the browser wouldn't restart the animation and
      // 'animationend' would never fire again after the very first flip.
      pageEl.classList.remove('flip-in-next', 'flip-in-prev', 'flip-out-next', 'flip-out-prev');
      pageEl.classList.add(`flip-out-${dir}`);
      pageEl.addEventListener('animationend', () => {
        pageEl.remove();
        currentPage = nextIdx;
        renderPage(dir);
        isAnimating = false;
        resumeAutoNarration();
      }, { once: true });
    } else {
      currentPage = nextIdx;
      renderPage(dir);
      isAnimating = false;
      resumeAutoNarration();
    }
  }

  // When narration auto-advances to the next page (see utter.onend below),
  // reading must continue on that page without the user clicking play again.
  function resumeAutoNarration() {
    if (!narration.pendingAutoAdvance) return;
    narration.pendingAutoAdvance = false;
    startNarration();
  }

  function updateProgress() {
    const total  = activeStory.pages.length;
    const pct    = ((currentPage + 1) / total) * 100;
    if (DOM.progressFill) DOM.progressFill.style.width = pct + '%';
    if (DOM.pageCounter)  DOM.pageCounter.textContent = `${currentPage + 1} / ${total}`;
    const mins = Math.round(((total - currentPage - 1) / total) * activeStory.readingTime);
    if (DOM.timeLeft) DOM.timeLeft.textContent = mins > 0 ? `~${mins}मि शेष` : 'अंत निकट';
  }

  function updateNavButtons() {
    if (!activeStory) return;
    const total = activeStory.pages.length;
    if (DOM.prevBtn) DOM.prevBtn.disabled = currentPage === 0;
    if (DOM.nextBtn) DOM.nextBtn.disabled = currentPage === total - 1;
  }

  function updateReaderTitle() {
    if (!DOM.storyTitle || !activeStory) return;
    DOM.storyTitle.textContent = jrGetLang() === 'hi' ? activeStory.title : activeStory.title_en;
  }

  // Shows the language the button will switch TO (matches the site-wide
  // nav toggle's own convention of labelling the target language).
  function updateLangToggleLabel() {
    if (!DOM.langToggle) return;
    DOM.langToggle.textContent = jrGetLang() === 'hi' ? 'EN' : 'हि';
  }

  function saveProgress() {
    if (!activeStory) return;
    progress[activeStory.id] = { page: currentPage, ts: Date.now() };
    localStorage.setItem('sb_progress', JSON.stringify(progress));
  }

  /* ═══════════════════════════════════════════════════
     NARRATION
  ═══════════════════════════════════════════════════ */
  function toggleNarration() {
    if (narration.playing) { pauseNarration(); } else { startNarration(); }
  }

  function startNarration() {
    const lang = jrGetLang();
    if (!window.speechSynthesis) {
      showToast(lang === 'hi' ? 'इस ब्राउज़र में वाचन उपलब्ध नहीं है।' : 'Narration is unavailable in this browser.');
      return;
    }
    stopNarration();
    const pageEl = document.getElementById('sb-page-text');
    if (!pageEl) return;

    const spans = [...pageEl.querySelectorAll('.sb-sent')];
    if (!spans.length) return;

    const voices = speechSynthesis.getVoices();
    if (voices.length) {
      speakWithVoices(voices, spans, lang);
      return;
    }

    // Chrome in particular can return an empty array from the first
    // getVoices() call because the OS voice catalog finishes loading
    // asynchronously. Wait once for 'voiceschanged' before giving up,
    // instead of treating an early call as "no voices exist".
    if (DOM.narrationLabel) {
      DOM.narrationLabel.textContent = lang === 'hi' ? 'आरंभ हो रहा है…' : 'Starting…';
    }
    let settled = false;
    const onVoicesChanged = () => {
      if (settled) return;
      settled = true;
      speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
      const loaded = speechSynthesis.getVoices();
      if (loaded.length) {
        speakWithVoices(loaded, spans, lang);
      } else {
        showToast(lang === 'hi' ? 'इस ब्राउज़र में कोई आवाज़ उपलब्ध नहीं है।' : 'No narration voices are available in this browser.');
        updateNarrationBtn();
      }
    };
    speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
    setTimeout(() => { if (!settled) onVoicesChanged(); }, 1000);
  }

  function speakWithVoices(voices, spans, lang) {
    const fullText = spans.map(s => s.textContent).join(' ');
    const utter = new SpeechSynthesisUtterance(fullText);

    // Voice — restricted to Hindi/English voices only (see isStoryVoice above).
    // The manual dropdown pick is only honoured if it actually matches the
    // page's language; otherwise a leftover selection from the other
    // language (e.g. an English voice while the dropdown still shows it in
    // Hindi mode) would read the text in the wrong voice.
    const storyVoices = voices.filter(isStoryVoice);
    const langVoices  = storyVoices.filter(v => lang === 'hi' ? v.lang.toLowerCase().startsWith('hi') : v.lang.toLowerCase().startsWith('en'));
    const voicePref   = DOM.narrationVoice ? DOM.narrationVoice.value : '';
    const voice = langVoices.find(v => v.name === voicePref) || langVoices[0] || storyVoices[0];
    if (voice) utter.voice = voice;
    utter.rate = parseFloat(DOM.narrationSpeed ? DOM.narrationSpeed.value : 1);
    utter.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';

    // Highlight via word boundary — approximate with sentence tracking
    let sentIdx = 0;
    utter.onboundary = (e) => {
      if (e.name !== 'sentence') return;
      spans.forEach(s => s.classList.remove('speaking'));
      if (spans[sentIdx]) spans[sentIdx].classList.add('speaking');
      sentIdx++;
    };

    utter.onstart = () => {
      narration.playing = true;
      updateNarrationBtn();
    };

    utter.onend = () => {
      narration.playing = false;
      updateNarrationBtn();
      if (narration.autoNext) {
        setTimeout(() => {
          if (activeStory && currentPage < activeStory.pages.length - 1) {
            narration.pendingAutoAdvance = true;
            flipPage('next');
          }
        }, 800);
      }
      spans.forEach(s => s.classList.remove('speaking'));
    };

    // Previously unhandled: a synthesis error (e.g. an unsupported voice/lang,
    // or the browser cancelling playback) left narration.playing stuck at
    // true with no feedback. Now it resets state and tells the user.
    utter.onerror = (e) => {
      narration.playing = false;
      updateNarrationBtn();
      spans.forEach(s => s.classList.remove('speaking'));
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        showToast(jrGetLang() === 'hi' ? 'वाचन में समस्या हुई।' : 'Narration failed to play.');
      }
    };

    speechSynthesis.speak(utter);
    narration.utterance = utter;
    narration.playing   = true; // optimistic; onstart confirms, onerror corrects
    updateNarrationBtn();
  }

  function pauseNarration() {
    if (window.speechSynthesis) speechSynthesis.pause();
    narration.playing = false;
    updateNarrationBtn();
  }

  function stopNarration() {
    if (window.speechSynthesis) speechSynthesis.cancel();
    narration.playing = false;
    narration.utterance = null;
    document.querySelectorAll('.sb-sent.speaking').forEach(s => s.classList.remove('speaking'));
    updateNarrationBtn();
  }

  function updateNarrationBtn() {
    if (DOM.narrationPlay) {
      DOM.narrationPlay.innerHTML = narration.playing
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
    }
    if (DOM.narrationLabel) {
      const lang = jrGetLang();
      DOM.narrationLabel.textContent = narration.playing
        ? (lang === 'hi' ? 'चल रहा है…' : 'Playing…')
        : (lang === 'hi' ? 'कहानी सुनें' : 'Read Story');
    }
  }

  // The story is only ever written in Hindi or English, so the voice list is
  // restricted to those languages — showing the full OS voice catalogue would
  // let a reader pick a voice that can't correctly read the text.
  function isStoryVoice(v) {
    const l = (v.lang || '').toLowerCase();
    return l.startsWith('hi') || l.startsWith('en');
  }

  function populateVoices() {
    if (!DOM.narrationVoice) return;
    const voices = speechSynthesis.getVoices().filter(isStoryVoice);
    // Curated to one voice per language — the OS can have 20+ English voice
    // packs installed, which turns the picker into unusable clutter.
    const hi = voices.find(v => v.lang.toLowerCase().startsWith('hi'));
    const en = voices.find(v => v.lang.toLowerCase().startsWith('en'));
    const curated = [hi, en].filter(Boolean);
    DOM.narrationVoice.innerHTML = curated.map(v =>
      `<option value="${v.name}">${v.name} (${v.lang})</option>`
    ).join('');
  }

  /* ═══════════════════════════════════════════════════
     BACKGROUND MUSIC (Web Audio oscillator ambient)
  ═══════════════════════════════════════════════════ */
  function toggleMusic() {
    settings.music = !settings.music;
    settings.music ? startMusic() : stopMusic();
    saveSettings();
    if (DOM.musicToggle) DOM.musicToggle.classList.toggle('active', settings.music);
  }

  function startMusic() {
    if (musicCtx) return;
    try {
      musicCtx = new (window.AudioContext || window.webkitAudioContext)();
      // Gentle ambient drone — 3 oscillators
      const freqs = [220, 329.6, 440];
      const masterGain = musicCtx.createGain();
      masterGain.gain.value = 0.04;
      masterGain.connect(musicCtx.destination);

      freqs.forEach(freq => {
        const osc = musicCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = musicCtx.createGain();
        g.gain.value = 0.3;
        osc.connect(g);
        g.connect(masterGain);
        osc.start();
        // Slow LFO on gain
        const lfo = musicCtx.createOscillator();
        lfo.frequency.value = 0.05;
        const lfoGain = musicCtx.createGain();
        lfoGain.gain.value = 0.15;
        lfo.connect(lfoGain);
        lfoGain.connect(g.gain);
        lfo.start();
      });
    } catch (_) {}
  }

  function stopMusic() {
    if (musicCtx) { musicCtx.close(); musicCtx = null; musicNode = null; }
  }

  /* ═══════════════════════════════════════════════════
     SETTINGS
  ═══════════════════════════════════════════════════ */
  function applySettings(rebuild) {
    const overlay = DOM.overlay;
    if (!overlay) return;

    // Theme — this function only ever changes the theme class; it must never
    // decide open/closed itself. Read whatever state is already there
    // (set by openStory()/closeStory()) and preserve it across the rebuild.
    const wasOpen = overlay.classList.contains('open');
    overlay.className = `reader-overlay theme-${settings.theme}` + (wasOpen ? ' open' : '');

    // Font size / line height
    overlay.style.setProperty('--rd-font-size', settings.fontSize + 'px');
    overlay.style.setProperty('--rd-line-height', settings.lineHeight);

    if (rebuild && activeStory) { renderPage(); updateReaderTitle(); }
  }

  function saveSettings() {
    localStorage.setItem('sb_settings', JSON.stringify(settings));
  }

  /* ═══════════════════════════════════════════════════
     EVENTS
  ═══════════════════════════════════════════════════ */
  function wireEvents() {
    wireSearch();
    wireReaderControls();
    wireKeyboard();
    wireSwipe();
    wireSettingsPanel();
    wireNarrationPanel();
    wireEndPanel();
    wireVoices();
  }

  function wireReaderControls() {
    if (DOM.closeBtn) DOM.closeBtn.addEventListener('click', closeStory);
    if (DOM.prevBtn)  DOM.prevBtn.addEventListener('click', () => flipPage('prev'));
    if (DOM.nextBtn)  DOM.nextBtn.addEventListener('click', () => flipPage('next'));

    if (DOM.bookmarkBtn) DOM.bookmarkBtn.addEventListener('click', () => {
      if (!activeStory) return;
      bookmarks[activeStory.id] = !bookmarks[activeStory.id];
      localStorage.setItem('sb_bookmarks', JSON.stringify(bookmarks));
      DOM.bookmarkBtn.classList.toggle('active', bookmarks[activeStory.id]);
    });

    if (DOM.shareBtn) DOM.shareBtn.addEventListener('click', () => {
      const url = location.href;
      const text = `"${activeStory?.title}" पढ़िए जंगल राज पर 📖`;
      if (navigator.share) navigator.share({ title: text, url });
      else { navigator.clipboard.writeText(url); showToast('लिंक कॉपी हो गया!'); }
    });

    if (DOM.fullscreenBtn) DOM.fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    });

    if (DOM.narrationBtn) DOM.narrationBtn.addEventListener('click', () => {
      const panel = DOM.narrationPanel;
      const isOpen = panel.classList.toggle('open');
      if (DOM.settingsPanel) DOM.settingsPanel.classList.remove('open');
    });

    if (DOM.settingsBtn) DOM.settingsBtn.addEventListener('click', () => {
      const panel = DOM.settingsPanel;
      const isOpen = panel.classList.toggle('open');
      if (DOM.narrationPanel) DOM.narrationPanel.classList.remove('open');
    });

    if (DOM.langToggle) DOM.langToggle.addEventListener('click', () => {
      // Delegates to the site-wide language setter (js/i18n.js) so this
      // button and the main nav's hi/en toggle always agree — jrSetLang()
      // fires 'jr:langchange', which our own listener (see init()) picks up
      // to refresh the shelf and the open reader.
      jrSetLang(jrGetLang() === 'hi' ? 'en' : 'hi');
    });

    if (DOM.musicToggle) DOM.musicToggle.addEventListener('click', toggleMusic);
  }

  function wireSettingsPanel() {
    if (!DOM.settingsPanel) return;

    // Theme buttons
    DOM.settingsPanel.querySelectorAll('[data-theme]').forEach(btn => {
      btn.addEventListener('click', () => {
        settings.theme = btn.dataset.theme;
        applySettings(false);
        saveSettings();
        DOM.settingsPanel.querySelectorAll('[data-theme]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Font family
    DOM.settingsPanel.querySelectorAll('[data-font]').forEach(btn => {
      btn.addEventListener('click', () => {
        settings.fontFamily = btn.dataset.font;
        saveSettings();
        DOM.settingsPanel.querySelectorAll('[data-font]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Font size
    const fsSlider = document.getElementById('sb-font-size');
    const fsVal    = document.getElementById('sb-font-size-val');
    if (fsSlider) {
      fsSlider.value = settings.fontSize;
      fsSlider.addEventListener('input', () => {
        settings.fontSize = +fsSlider.value;
        if (fsVal) fsVal.textContent = fsSlider.value;
        applySettings(false);
        saveSettings();
      });
    }

    // Line height
    const lhSlider = document.getElementById('sb-line-height');
    const lhVal    = document.getElementById('sb-line-height-val');
    if (lhSlider) {
      lhSlider.value = settings.lineHeight;
      lhSlider.addEventListener('input', () => {
        settings.lineHeight = +lhSlider.value;
        if (lhVal) lhVal.textContent = (+lhSlider.value).toFixed(1);
        applySettings(false);
        saveSettings();
      });
    }
  }

  function wireNarrationPanel() {
    if (DOM.narrationPlay) DOM.narrationPlay.addEventListener('click', toggleNarration);

    if (DOM.narrationSpeed) {
      DOM.narrationSpeed.value = settings.narrationSpeed;
      DOM.narrationSpeed.addEventListener('input', () => {
        settings.narrationSpeed = +DOM.narrationSpeed.value;
        if (DOM.narrationSpeedVal) DOM.narrationSpeedVal.textContent = settings.narrationSpeed.toFixed(1) + '×';
        saveSettings();
      });
    }
  }

  function wireEndPanel() {
    if (!DOM.endPanel) return;
    // Reaction buttons
    DOM.endPanel.querySelectorAll('.reaction-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        DOM.endPanel.querySelectorAll('.reaction-btn').forEach(b => b.classList.remove('reacted'));
        btn.classList.add('reacted');
        showToast('आपकी प्रतिक्रिया दर्ज हो गई 🙏');
      });
    });

    // Star rating
    DOM.endPanel.querySelectorAll('.end-star').forEach((star, i) => {
      star.addEventListener('click', () => {
        DOM.endPanel.querySelectorAll('.end-star').forEach((s, j) => {
          s.classList.toggle('rated', j <= i);
          s.textContent = j <= i ? '★' : '☆';
        });
        showToast(`${i + 1} तारे ⭐ — शुक्रिया!`);
      });
    });

    const readMore = document.getElementById('sb-end-more');
    if (readMore) readMore.addEventListener('click', () => {
      closeStory();
    });

    const endShare = document.getElementById('sb-end-share');
    if (endShare) endShare.addEventListener('click', () => {
      const url = location.href;
      if (navigator.share) navigator.share({ title: activeStory?.title || '', url });
      else { navigator.clipboard.writeText(url); showToast('लिंक कॉपी हो गया!'); }
    });
  }

  function wireKeyboard() {
    document.addEventListener('keydown', e => {
      if (!DOM.overlay?.classList.contains('open')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') flipPage('next');
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   flipPage('prev');
      if (e.key === 'Escape') closeStory();
      if (e.key === ' ') { e.preventDefault(); toggleNarration(); }
    });
  }

  function wireSwipe() {
    if (!DOM.stage) return;
    let startX = 0, startY = 0;
    DOM.stage.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });
    DOM.stage.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
        flipPage(dx < 0 ? 'next' : 'prev');
      }
    }, { passive: true });
  }

  function wireVoices() {
    if (!window.speechSynthesis) return;
    speechSynthesis.onvoiceschanged = populateVoices;
    populateVoices();
  }

  /* ── Utilities ─────────────────────────────────── */
  function showToast(msg) {
    let t = document.getElementById('sb-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'sb-toast';
      t.style.cssText = `position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
        background:rgba(0,0,0,.85);color:#fff;padding:10px 20px;border-radius:999px;
        font-size:13px;z-index:9999;transition:opacity .3s;pointer-events:none;`;
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(t._to);
    t._to = setTimeout(() => { t.style.opacity = '0'; }, 2500);
  }

  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  /* ── Public API ────────────────────────────────── */
  return { init, openStory };

})();

/* ── Bootstrap ─────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => Storybook.init());
