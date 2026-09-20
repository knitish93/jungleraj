/* =========================================================
   politicians.js — Phase 6 Flagship Module
   Search · Filter · Sort · Cards · Table · Profile Modal ·
   Compare · Charts · Top-100 Richest · Pagination · i18n
   ========================================================= */
'use strict';

const Pol = (() => {

  /* ── State ──────────────────────────────────────────── */
  let all = [], filtered = [], page = 1;
  const PAGE_SIZE = 12;
  let view = 'grid'; // 'grid' | 'table'
  let sortKey = 'name', sortDir = 'asc';
  let compareQueue = []; // max 2 IDs
  let activeProfileId = null; // id of the leader whose profile modal is open, if any
  let profileCharts = {};

  /* ── Filters ─────────────────────────────────────────── */
  const filters = {
    q: '', state: '', party: '', position: '',
    house: '', gender: '', eduMin: '',
    maxAssets: '', minYear: '',
  };

  /* ═══════════════════════════════════════════════════════
     BOOT
  ═══════════════════════════════════════════════════════ */
  async function init() {
    const grid = document.getElementById('pol-grid');
    if (!grid) return;

    grid.innerHTML = jrSkeletonCards(9);
    all = await jrMinDelay(jrLoadData('politicians.json'));
    filtered = [...all];

    buildHeroMetrics();
    buildFilterOptions();
    wireToolbar();
    wireFilterBar();
    wireViewToggle();
    wireProfileModal();
    wireCompareModal();
    wirePagination();
    applyFilters();
    buildCharts();
    buildRichestStrip();

    // React to the site-wide language toggle — everything here is rendered
    // from JS templates, so switching language needs an explicit re-render.
    document.addEventListener('jr:langchange', () => {
      updateResultsBar();
      updateCompareBtnLabel();
      render();
      buildCharts();
      buildRichestStrip();
      if (activeProfileId) openProfile(activeProfileId);
      if (compareQueue.length === 2 && document.getElementById('pol-compare-overlay')?.classList.contains('open')) openCompare();
    });
  }

  /* ─────────────────────────────────────────────────────
     HERO METRICS
  ───────────────────────────────────────────────────── */
  function buildHeroMetrics() {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const total     = all.length;
    const parties   = new Set(all.map(p => p.party)).size;
    const states    = new Set(all.map(p => p.state)).size;
    // Average only over records that actually report assets — treating a
    // missing (unverified) figure as ₹0 would silently drag the average down.
    const withAssets = all.filter(p => p.assets_cr != null);
    const avgAssets = withAssets.length
      ? (withAssets.reduce((s, p) => s + p.assets_cr, 0) / withAssets.length).toFixed(1)
      : '—';
    set('pol-count-total', total);
    set('pol-count-parties', parties);
    set('pol-count-states', states);
    set('pol-avg-assets', `₹${avgAssets} Cr`);

    animateCounters(['pol-count-total','pol-count-parties','pol-count-states']);
  }

  function animateCounters(ids) {
    if (!window.IntersectionObserver) return;
    const obs = new IntersectionObserver(entries => {
      entries.filter(e => e.isIntersecting).forEach(e => {
        const el = e.target, end = parseInt(el.textContent.replace(/\D/g,''), 10);
        if (isNaN(end)) return;
        let cur = 0, inc = end / 40;
        const t = setInterval(() => {
          cur = Math.min(cur + inc, end);
          el.textContent = Math.floor(cur).toLocaleString('en-IN');
          if (cur >= end) clearInterval(t);
        }, 30);
        obs.unobserve(el);
      });
    }, { threshold: 0.5 });
    ids.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
  }

  /* ─────────────────────────────────────────────────────
     FILTER OPTIONS (dynamic from data)
  ───────────────────────────────────────────────────── */
  function buildFilterOptions() {
    populateSelect('fil-state',    [...new Set(all.map(p => p.state).filter(Boolean))].sort());
    populateSelect('fil-party',    [...new Set(all.map(p => p.party).filter(Boolean))].sort());
    populateSelect('fil-position', [...new Set(all.map(p => p.position).filter(Boolean))].sort());
    populateSelect('fil-house',    [...new Set(all.map(p => p.house).filter(Boolean))].sort());
    populateSelect('fil-gender',   ['Male','Female','Other']);

    // KYP home widget
    populateSelect('kyp-state', [...new Set(all.map(p => p.state).filter(Boolean))].sort());
    populateSelect('kyp-party', [...new Set(all.map(p => p.party).filter(Boolean))].sort());
  }

  function populateSelect(id, options) {
    const el = document.getElementById(id);
    if (!el) return;
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      el.appendChild(o);
    });
  }

  /* ─────────────────────────────────────────────────────
     TOOLBAR / SEARCH
  ───────────────────────────────────────────────────── */
  function wireToolbar() {
    const search = document.getElementById('pol-search');
    const sort   = document.getElementById('pol-sort');
    if (search) search.addEventListener('input', debounce(() => { filters.q = search.value.trim().toLowerCase(); applyFilters(); }, 220));
    if (sort)   sort.addEventListener('change', () => { const [k,d] = sort.value.split(':'); sortKey = k; sortDir = d || 'asc'; applyFilters(); });

    // Filter toggle
    document.getElementById('pol-filter-toggle')?.addEventListener('click', () => {
      document.getElementById('pol-filter-bar')?.classList.toggle('hidden');
    });
    // Compare button
    document.getElementById('pol-compare-btn')?.addEventListener('click', openCompare);
  }

  function wireFilterBar() {
    const ids = ['fil-state','fil-party','fil-position','fil-house','fil-gender','fil-max-assets'];
    ids.forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => { collectFilters(); applyFilters(); });
    });
    document.getElementById('pol-filter-clear')?.addEventListener('click', () => {
      ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      Object.keys(filters).forEach(k => { if (k !== 'q') filters[k] = ''; });
      applyFilters();
    });
  }

  function collectFilters() {
    filters.state    = document.getElementById('fil-state')?.value    || '';
    filters.party    = document.getElementById('fil-party')?.value    || '';
    filters.position = document.getElementById('fil-position')?.value || '';
    filters.house    = document.getElementById('fil-house')?.value    || '';
    filters.gender   = document.getElementById('fil-gender')?.value   || '';
    filters.maxAssets= document.getElementById('fil-max-assets')?.value || '';
  }

  /* ─────────────────────────────────────────────────────
     FILTER + SORT + PAGINATE
  ───────────────────────────────────────────────────── */
  function applyFilters() {
    const q = filters.q;
    filtered = all.filter(p => {
      if (q && !matchesSearch(p, q)) return false;
      if (filters.state    && p.state    !== filters.state)    return false;
      if (filters.party    && p.party    !== filters.party)    return false;
      if (filters.position && p.position !== filters.position) return false;
      if (filters.house    && p.house    !== filters.house)    return false;
      if (filters.gender   && p.gender   !== filters.gender)   return false;
      if (filters.maxAssets && (p.assets_cr || 0) > parseFloat(filters.maxAssets))   return false;
      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      av = av ?? (typeof av === 'number' ? -Infinity : '');
      bv = bv ?? (typeof bv === 'number' ? -Infinity : '');
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    page = 1;
    updateResultsBar();
    render();
  }

  function matchesSearch(p, q) {
    return [
      p.name, p.name_hi, p.name_en, p.state,
      p.party, p.constituency, p.position,
      p.ministry, p.education, p.profession,
    ].some(v => v && v.toLowerCase().includes(q));
  }

  function updateResultsBar() {
    const el = document.getElementById('pol-result-count');
    if (el) el.textContent = `${filtered.length} ${jrT('politicians.resultsFound')}`;
  }

  function updateCompareBtnLabel() {
    const compBtn = document.getElementById('pol-compare-btn');
    if (compBtn) compBtn.textContent = `⚖ ${jrT('politicians.compareTrigger')} (${compareQueue.length}/2)`;
  }

  /* ─────────────────────────────────────────────────────
     RENDERING (grid / table)
  ───────────────────────────────────────────────────── */
  function render() {
    const start  = (page - 1) * PAGE_SIZE;
    const slice  = filtered.slice(start, start + PAGE_SIZE);
    if (view === 'grid') renderGrid(slice);
    else                  renderTable(slice);
    renderPagination();
  }

  /* ── GRID ─────────────────────────────── */
  function renderGrid(slice) {
    const el = document.getElementById('pol-grid');
    if (!el) return;
    if (!slice.length) { el.innerHTML = jrEmptyState({ icon: 'user', titleKey: 'common.noResults', subKey: 'common.noResultsSub' }); return; }
    el.className = 'pol-grid';
    el.innerHTML = slice.map(polCard).join('');
    el.querySelectorAll('[data-pol-id]').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.pol-card-compare-btn')) return;
        openProfile(card.dataset.polId);
      });
    });
    el.querySelectorAll('.pol-card-compare-btn').forEach(btn => {
      btn.addEventListener('click', () => toggleCompare(btn.dataset.polId, btn));
    });
  }

  function polCard(p) {
    const initials  = initials2(p.name);
    const gender    = (p.gender || '').toLowerCase();
    const inCompare = compareQueue.includes(p.id);
    return `
    <article class="card pol-card reveal in-view" data-pol-id="${jrEscape(p.id)}">
      <button class="pol-card-compare-btn${inCompare?' selected':''}" data-pol-id="${jrEscape(p.id)}" title="${jrT('politicians.addToCompare')}" aria-label="${jrT('politicians.compareLabel')}">⚖</button>
      <div class="pol-card-top">
        <div class="pol-avatar ${gender}">${initials}</div>
        <div>
          <div class="pol-card-name">${jrEscape(p.name_en || p.name)}</div>
          <div class="pol-card-name-hi">${jrEscape(p.name_hi || '')}</div>
          <div class="pol-card-pos">${jrEscape(p.position || '')}${p.house ? ' · ' + jrEscape(p.house) : ''}</div>
        </div>
      </div>
      <div class="pol-card-badges">
        ${p.party    ? `<span class="badge badge-saffron">${jrEscape(p.party)}</span>` : ''}
        ${p.state    ? `<span class="badge">${jrEscape(p.state)}</span>` : ''}
        ${p.ministry ? `<span class="badge badge-green" style="font-size:10px">${jrEscape(p.ministry)}</span>` : ''}
      </div>
      <div class="pol-card-stats">
        <div class="pol-mini-stat">
          <span class="pmv">₹${formatCr(p.assets_cr)}</span>
          <span class="pml">${jrT('politicians.assetsUnit')}</span>
        </div>
        <div class="pol-mini-stat">
          <span class="pmv">${jrEscape(p.education ? shortEdu(p.education) : '—')}</span>
          <span class="pml">${jrT('politicians.educationUnit')}</span>
        </div>
      </div>
    </article>`;
  }

  /* ── TABLE ────────────────────────────── */
  function renderTable(slice) {
    const el = document.getElementById('pol-grid');
    if (!el) return;
    if (!slice.length) { el.innerHTML = jrEmptyState({ icon: 'user', titleKey: 'common.noResults', subKey: 'common.noResultsSub' }); return; }
    el.className = '';
    const headers = [
      { key: 'name',           label: jrT('politicians.tableName') },
      { key: 'party',          label: jrT('politicians.tableParty') },
      { key: 'state',          label: jrT('politicians.tableState') },
      { key: 'position',       label: jrT('politicians.tablePosition') },
      { key: 'assets_cr',      label: jrT('politicians.tableAssets') },
      { key: 'liabilities_cr', label: jrT('politicians.tableLiabilities') },
      { key: 'education',      label: jrT('politicians.tableEducation') },
    ];
    el.innerHTML = `
      <div class="pol-table-wrap">
        <table class="pol-table" role="grid">
          <thead>
            <tr>${headers.map(h => `
              <th data-sort="${h.key}" class="${sortKey === h.key ? 'sorted' : ''}">
                ${h.label}<span class="sort-arrow">${sortKey === h.key ? (sortDir==='asc'?'↑':'↓') : '↕'}</span>
              </th>`).join('')}</tr>
          </thead>
          <tbody>
            ${slice.map(polRow).join('')}
          </tbody>
        </table>
      </div>`;
    el.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const k = th.dataset.sort;
        sortDir = (sortKey === k && sortDir === 'asc') ? 'desc' : 'asc';
        sortKey = k;
        applyFilters();
      });
    });
    el.querySelectorAll('[data-pol-id]').forEach(row => {
      row.addEventListener('click', () => openProfile(row.dataset.polId));
    });
  }

  function polRow(p) {
    const initials = initials2(p.name);
    const gender   = (p.gender || '').toLowerCase();
    return `
      <tr data-pol-id="${jrEscape(p.id)}" style="cursor:pointer">
        <td><span class="td-avatar ${gender}">${initials}</span><span class="td-name">${jrEscape(p.name_en || p.name)}</span></td>
        <td><div class="td-badge"><span class="badge badge-saffron" style="font-size:10px">${jrEscape(p.party || '—')}</span></div></td>
        <td>${jrEscape(p.state || '—')}</td>
        <td>${jrEscape(p.position || '—')}</td>
        <td class="td-money">₹${formatCr(p.assets_cr)}</td>
        <td class="td-money">₹${formatCr(p.liabilities_cr)}</td>
        <td style="font-size:var(--fs-xs)">${jrEscape(shortEdu(p.education))}</td>
      </tr>`;
  }

  /* ── View toggle ──────────────────────── */
  function wireViewToggle() {
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        view = btn.dataset.view;
        document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b === btn));
        render();
      });
    });
  }

  /* ─────────────────────────────────────────────────────
     PAGINATION
  ───────────────────────────────────────────────────── */
  function wirePagination() { /* handled in renderPagination() */ }

  function renderPagination() {
    const wrap  = document.getElementById('pol-pagination');
    if (!wrap) return;
    const total = Math.ceil(filtered.length / PAGE_SIZE);
    if (total <= 1) { wrap.innerHTML = ''; return; }

    const buttons = [];
    buttons.push(`<button ${page===1?'disabled':''} data-page="${page-1}">←</button>`);

    const range = pageRange(page, total);
    let prev = null;
    for (const p of range) {
      if (prev !== null && p - prev > 1) buttons.push(`<span style="color:var(--color-text-dim);padding:0 4px">…</span>`);
      buttons.push(`<button class="${p===page?'active':''}" data-page="${p}">${p}</button>`);
      prev = p;
    }
    buttons.push(`<button ${page===total?'disabled':''} data-page="${page+1}">→</button>`);
    const start = (page - 1) * PAGE_SIZE + 1;
    const end   = Math.min(page * PAGE_SIZE, filtered.length);
    buttons.push(`<span class="pol-page-info">${start}–${end} / ${filtered.length}</span>`);

    wrap.innerHTML = buttons.join('');
    wrap.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => { page = parseInt(btn.dataset.page); render(); wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
    });
  }

  function pageRange(current, total, delta = 2) {
    const pages = new Set([1, total]);
    for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) pages.add(i);
    return [...pages].sort((a, b) => a - b);
  }

  /* ─────────────────────────────────────────────────────
     PROFILE MODAL
  ───────────────────────────────────────────────────── */
  function wireProfileModal() {
    const overlay = document.getElementById('pol-profile-overlay');
    if (!overlay) return;
    overlay.addEventListener('click', e => { if (e.target === overlay) closeProfile(); });
    document.getElementById('pol-profile-close')?.addEventListener('click', closeProfile);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeProfile(); });
  }

  function openProfile(id) {
    const p = all.find(x => x.id === id);
    if (!p) return;
    const overlay = document.getElementById('pol-profile-overlay');
    if (!overlay) return;
    activeProfileId = id;

    // Header
    const gender   = (p.gender || '').toLowerCase();
    const initials = initials2(p.name);
    document.getElementById('pp-avatar')?.setAttribute('class', `profile-avatar-lg ${gender}`);
    const av = document.getElementById('pp-avatar');
    if (av) av.textContent = initials;
    setText('pp-name',    p.name_en || p.name);
    setText('pp-name-hi', p.name_hi || '');
    const badges = document.getElementById('pp-badges');
    if (badges) badges.innerHTML = [
      p.party    && `<span class="badge badge-saffron">${jrEscape(p.party)}</span>`,
      p.position && `<span class="badge">${jrEscape(p.position)}</span>`,
      p.house    && `<span class="badge badge-green">${jrEscape(p.house)}</span>`,
      p.state    && `<span class="badge">${jrEscape(p.state)}</span>`,
    ].filter(Boolean).join('');

    // Metrics strip
    setText('pp-assets',   `₹${formatCr(p.assets_cr)} Cr`);
    setText('pp-liab',     `₹${formatCr(p.liabilities_cr)} Cr`);
    setText('pp-age', p.age ? `${p.age} ${jrT('politicians.ageUnit')}` : '—');

    // Tab: Overview
    setText('pp-constituency', p.constituency || '—');
    setText('pp-state',        p.state || '—');
    setText('pp-party',        p.party || '—');
    setText('pp-gender',       p.gender || '—');
    setText('pp-dob',          p.dob || '—');
    setText('pp-profession',   p.profession || '—');
    setText('pp-election-year',p.election_year || '—');
    setText('pp-votes',        p.votes_received ? p.votes_received.toLocaleString('en-IN') : '—');
    setText('pp-vote-share',   p.vote_share_pct ? `${p.vote_share_pct}%` : '—');

    // Tab: Education
    setText('pp-education',    p.education || '—');
    setText('pp-qualification', p.qualification || '—');
    setText('pp-ministry',     p.ministry || '—');
    setText('pp-cabinet',      p.cabinet || '—');

    // Tab: Assets
    const totalAssets = p.assets_cr || 0;
    const movPct   = totalAssets > 0 ? (p.movable_cr   || 0) / totalAssets * 100 : 0;
    const immovPct = totalAssets > 0 ? (p.immovable_cr || 0) / totalAssets * 100 : 0;
    setText('pp-assets-total',    `₹${formatCr(p.assets_cr)} Cr`);
    setText('pp-assets-movable',  `₹${formatCr(p.movable_cr)} Cr`);
    setText('pp-assets-immovable',`₹${formatCr(p.immovable_cr)} Cr`);
    setText('pp-liab-total',      `₹${formatCr(p.liabilities_cr)} Cr`);
    const movBar   = document.getElementById('pp-bar-movable');
    const immovBar = document.getElementById('pp-bar-immovable');
    if (movBar)   setTimeout(() => movBar.style.width   = movPct + '%', 100);
    if (immovBar) setTimeout(() => immovBar.style.width = immovPct + '%', 100);

    // Tab: Links
    setHref('pp-link-affidavit',  p.affidavit_url   || '#');
    setHref('pp-link-official',   p.official_url    || '#');
    setHref('pp-link-wikipedia',  p.wikipedia_url   || '#');
    setHref('pp-link-parliament', p.parliament_url  || '#');
    setText('pp-official-source', p.official_source || '—');
    setText('pp-last-updated',    p.last_updated    || '—');

    // Career timeline
    buildCareerTimeline(p);

    // Switch to first tab
    activateTab('overview');

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    overlay.scrollTop = 0;
  }

  function buildCareerTimeline(p) {
    const wrap = document.getElementById('pp-timeline');
    if (!wrap) return;
    const positions = p.prev_positions || [];
    if (!positions.length) {
      wrap.innerHTML = `<p style="color:var(--color-text-dim);font-size:var(--fs-sm)">${jrT('politicians.noCareerInfo')}</p>`;
      return;
    }
    // Current position first
    const items = [{ year: p.election_year || '—', role: `${p.position} — ${p.constituency || p.state}` }, ...positions.map(pos => ({ year: '—', role: pos }))];
    wrap.innerHTML = items.map(it => `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="timeline-text">
          <div class="timeline-year">${jrEscape(String(it.year))}</div>
          <div class="timeline-role">${jrEscape(it.role)}</div>
        </div>
      </div>`).join('');
  }

  function closeProfile() {
    document.getElementById('pol-profile-overlay')?.classList.remove('open');
    document.body.style.overflow = '';
    activeProfileId = null;
  }

  function activateTab(name) {
    document.querySelectorAll('.profile-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === name));
    document.querySelectorAll('.profile-tab-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.tabPanel === name));
  }

  function wireProfileTabs() {
    document.querySelectorAll('.profile-tab').forEach(btn => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
  }

  /* ─────────────────────────────────────────────────────
     COMPARE MODAL
  ───────────────────────────────────────────────────── */
  function wireCompareModal() {
    const overlay = document.getElementById('pol-compare-overlay');
    if (!overlay) return;
    overlay.addEventListener('click', e => { if (e.target === overlay) closeCompare(); });
    document.getElementById('pol-compare-close')?.addEventListener('click', closeCompare);
  }

  function toggleCompare(id, btn) {
    if (compareQueue.includes(id)) {
      compareQueue = compareQueue.filter(x => x !== id);
    } else if (compareQueue.length < 2) {
      compareQueue.push(id);
    } else {
      jrToast(jrT('politicians.compareMaxToast'));
      return;
    }
    btn?.classList.toggle('selected', compareQueue.includes(id));

    updateCompareBtnLabel();
    const compBtn = document.getElementById('pol-compare-btn');
    if (compBtn) compBtn.style.display = compareQueue.length ? '' : 'none';
    if (compareQueue.length === 2) openCompare();
  }

  function openCompare() {
    if (compareQueue.length < 2) { jrToast(jrT('politicians.compareSelectToast')); return; }
    const [a, b] = compareQueue.map(id => all.find(p => p.id === id)).filter(Boolean);
    if (!a || !b) return;

    const overlay = document.getElementById('pol-compare-overlay');
    if (!overlay) return;

    const fields = [
      { label: jrT('politicians.compareFieldPosition'), key: 'position' },
      { label: jrT('politicians.compareFieldState'), key: 'state' },
      { label: jrT('politicians.compareFieldParty'), key: 'party' },
      { label: jrT('politicians.compareFieldEducation'), key: 'education' },
      { label: jrT('politicians.compareFieldQualification'), key: 'qualification' },
      { label: jrT('politicians.compareFieldAge'), key: 'age', suffix: ' ' + jrT('politicians.ageUnit'), higherIsBetter: false },
      { label: jrT('politicians.compareFieldProfession'), key: 'profession' },
      { label: jrT('politicians.compareFieldTotalAssets'), key: 'assets_cr', prefix: '₹', suffix: ' Cr', higherIsBetter: true },
      { label: jrT('politicians.compareFieldLiabilities'), key: 'liabilities_cr', prefix: '₹', suffix: ' Cr', higherIsBetter: false },
      { label: jrT('politicians.compareFieldVotes'), key: 'votes_received', higherIsBetter: true },
      { label: jrT('politicians.compareFieldVoteShare'), key: 'vote_share_pct', suffix: '%', higherIsBetter: true },
    ];

    const buildHead = p => `
      <div class="compare-pol-head">
        <div class="pol-avatar ${(p.gender||'').toLowerCase()}" style="width:44px;height:44px;font-size:var(--fs-md);margin:0 auto var(--sp-3)">${initials2(p.name)}</div>
        <div class="cpn">${jrEscape(p.name_en || p.name)}</div>
        <div class="cpp">${jrEscape(p.party || '')}</div>
      </div>`;

    const buildRows = () => fields.map(f => {
      const av = a[f.key], bv = b[f.key];
      const fmt = (v) => v == null || v === '' ? '—' : `${f.prefix || ''}${typeof v === 'number' ? v.toLocaleString('en-IN') : v}${f.suffix || ''}`;
      let aCls = '', bCls = '';
      if (f.higherIsBetter !== undefined && typeof av === 'number' && typeof bv === 'number' && av !== bv) {
        const aBetter = f.higherIsBetter ? av > bv : av < bv;
        aCls = aBetter ? 'compare-winner' : '';
        bCls = !aBetter ? 'compare-winner' : '';
      }
      return `
        <div class="compare-row">
          <div class="compare-cell" style="background:var(--color-bg-elevated);font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-dim)">${f.label}</div>
          <div class="compare-cell ${aCls}"><span class="mono">${fmt(av)}</span></div>
          <div class="compare-cell ${bCls}"><span class="mono">${fmt(bv)}</span></div>
        </div>`;
    }).join('');

    const grid = document.getElementById('pol-compare-grid');
    if (grid) grid.innerHTML = `
      <div class="compare-label-col"><div class="compare-pol-head" style="background:var(--color-bg-elevated)">&nbsp;</div></div>
      <div class="compare-pol-col">${buildHead(a)}</div>
      <div class="compare-pol-col">${buildHead(b)}</div>
      ${buildRows()}`;

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeCompare() {
    document.getElementById('pol-compare-overlay')?.classList.remove('open');
    document.body.style.overflow = '';
  }

  /* ─────────────────────────────────────────────────────
     CHARTS
  ───────────────────────────────────────────────────── */
  function buildCharts() {
    if (!window.Chart) return;
    Chart.defaults.color = '#a3a1a8';

    // Party distribution
    buildPieChart('chart-party', countBy(all, 'party'));
    // State distribution
    buildBarChart('chart-state', countBy(all, 'state'), 10);
    // Education
    buildPieChart('chart-edu', countBy(all, 'qualification'));
  }

  // Re-created on every language change (see jr:langchange above) since
  // buildCharts() re-runs then — Chart.js errors if a new chart is attached
  // to a canvas that still has one, so the old instance must be destroyed first.
  function buildPieChart(id, data) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    Chart.getChart(ctx)?.destroy();
    const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const COLORS = ['#c1272d','#ff9933','#2255a4','#128807','#a78bfa','#0d9488','#f59e0b','#67e8f9'];
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: entries.map(e => e[0]),
        datasets: [{ data: entries.map(e => e[1]), backgroundColor: COLORS, borderColor: 'transparent', hoverOffset: 8 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { usePointStyle: true, padding: 10, font: { size: 11 } } } } }
    });
  }

  function buildBarChart(id, data, topN) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    Chart.getChart(ctx)?.destroy();
    const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, topN);
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: entries.map(e => e[0]),
        datasets: [{ data: entries.map(e => e[1]), backgroundColor: '#c1272d99', borderColor: '#c1272d', borderWidth: 1 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { grid: { color: '#ffffff0a' } }, y: { grid: { display: false } } }
      }
    });
  }

  /* ─────────────────────────────────────────────────────
     RICHEST STRIP
  ───────────────────────────────────────────────────── */
  function buildRichestStrip() {
    const wrap = document.getElementById('pol-richest-list');
    if (!wrap) return;
    const richest = [...all].sort((a, b) => (b.assets_cr || 0) - (a.assets_cr || 0)).slice(0, 20);
    wrap.innerHTML = richest.map((p, i) => `
      <div class="pol-richest-row" data-pol-id="${jrEscape(p.id)}">
        <div class="pol-richest-rank">#${i + 1}</div>
        <div class="pol-avatar ${(p.gender||'').toLowerCase()}" style="width:32px;height:32px;font-size:11px">${initials2(p.name)}</div>
        <div>
          <div class="pol-richest-name">${jrEscape(p.name_en || p.name)}</div>
          <div class="pol-richest-party">${jrEscape(p.party || '')} · ${jrEscape(p.state || '')}</div>
        </div>
        <div class="pol-richest-value">₹${formatCr(p.assets_cr)} Cr</div>
      </div>`).join('');
    wrap.querySelectorAll('[data-pol-id]').forEach(row => {
      row.addEventListener('click', () => openProfile(row.dataset.polId));
    });
  }

  /* ─────────────────────────────────────────────────────
     HOME KYP (Know Your Politician)
  ───────────────────────────────────────────────────── */
  function initKYP() {
    const btn = document.getElementById('kyp-search-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const name  = (document.getElementById('kyp-name-input')?.value  || '').toLowerCase();
      const state = document.getElementById('kyp-state')?.value || '';
      const party = document.getElementById('kyp-party')?.value || '';
      const results = all.filter(p =>
        (!name  || p.name.toLowerCase().includes(name) || (p.name_en||'').toLowerCase().includes(name)) &&
        (!state || p.state === state) &&
        (!party || p.party === party)
      ).slice(0, 6);
      const el = document.getElementById('kyp-results');
      if (!el) return;
      if (!results.length) { el.innerHTML = `<p style="color:var(--color-text-dim);font-size:var(--fs-sm)">${jrT('politicians.noLeaderFound')}</p>`; return; }
      el.innerHTML = `<div class="card-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));margin-top:var(--sp-4)">${results.map(p => `
        <div class="card" style="cursor:pointer;padding:var(--sp-4)" data-pol-id="${jrEscape(p.id)}">
          <div class="pol-avatar ${(p.gender||'').toLowerCase()}" style="width:40px;height:40px;font-size:var(--fs-sm);margin-bottom:var(--sp-3)">${initials2(p.name)}</div>
          <div style="font-size:var(--fs-sm);color:var(--color-white);font-weight:600">${jrEscape(p.name_en||p.name)}</div>
          <div style="font-size:var(--fs-xs);color:var(--color-text-dim)">${jrEscape(p.party||'')} · ${jrEscape(p.state||'')}</div>
        </div>`).join('')}</div>`;
      el.querySelectorAll('[data-pol-id]').forEach(card => {
        card.addEventListener('click', () => {
          window.location.href = `pages/politicians.html?id=${card.dataset.polId}`;
        });
      });
    });
  }

  /* ─────────────────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────────────────── */
  function initials2(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  }
  function formatCr(val) {
    if (!val && val !== 0) return '—';
    if (val >= 1000) return `${(val/1000).toFixed(1)}K`;
    return parseFloat(val).toFixed(1);
  }
  function shortEdu(edu) {
    if (!edu) return '—';
    const map = { 'Doctorate': 'PhD', 'Postgraduate': 'PG', 'Graduate': 'UG', 'Below Graduate': '<UG', 'Certificate': 'Cert.' };
    return map[edu] || edu.split(',')[0].trim().substring(0, 10);
  }
  function countBy(arr, key) {
    const map = {};
    arr.forEach(item => { const v = item[key] || jrT('politicians.unknown'); map[v] = (map[v]||0) + 1; });
    return map;
  }
  function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val || '—'; }
  function setHref(id, val) { const el = document.getElementById(id); if (el) { el.href = val; el.style.display = val && val !== '#' ? '' : 'none'; } }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  return { init, initKYP };
})();

document.addEventListener('DOMContentLoaded', () => {
  Pol.init();
  Pol.initKYP();
  // Wire profile tabs
  document.querySelectorAll('.profile-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.profile-tab').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.profile-tab-panel').forEach(p => p.classList.toggle('active', p.dataset.tabPanel === btn.dataset.tab));
    });
  });
});
