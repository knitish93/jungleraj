/* =========================================================
   featured-surveys.js — Featured surveys on homepage
   One sequential 3-question poll (state derived from persisted
   per-question answers — not a single completed flag) + two
   independent standalone yes/no surveys.
   ========================================================= */
'use strict';

const FeaturedSurveys = (() => {
  let allVotes    = [];
  let voterId     = null;
  let currentStep = 1; // 1..3 — which question is being *viewed* in the sequential flow

  // Chart instances keyed by canvas id, so re-renders can destroy before recreate.
  const charts = {};

  const CHART_BG = '#0a0a0d';

  const PM_CANDIDATES = [
    { id: 'cand_001', name: 'Narendra Modi',     party: 'BJP',         photo: 'images/candidates/narendra-modi.jpg' },
    { id: 'cand_002', name: 'C. Joseph Vijay',   party: 'ADMK',        photo: 'images/candidates/joseph-vijay.jpg' },
    { id: 'cand_003', name: 'Rahul Gandhi',      party: 'INC',         photo: 'images/candidates/rahul-gandhi.jpg' },
    { id: 'cand_004', name: 'Yogi Adityanath',   party: 'BJP',         photo: 'images/candidates/yogi-adityanath.jpg' },
    { id: 'cand_005', name: 'Prashant Kishore',  party: 'Independent', photo: 'images/candidates/prashant-kishore.jpg' },
    { id: 'cand_006', name: 'None of the above', party: '',            photo: 'CROSS' },
  ];
  // The 3 sequential questions, in order. `id` is the survey_id used for persistence.
  const SEQ = [
    { id: 'gov_performance',             titleKey: 'home.featured.gov_performance',           kind: 'yesno',      dom: 'gov' },
    { id: 'pm_preference',               titleKey: 'home.featured.pm_title',                  kind: 'candidates', dom: 'pm'  },
    { id: 'politician_accountability',   titleKey: 'home.featured.politician_accountability', kind: 'yesno',      dom: 'pol' },
  ];

  /* ── Init ─────────────────────────────────────────────── */

  async function init() {
    const container = document.getElementById('featured-surveys-container');
    if (!container) return;

    voterId = getVoterId();
    const saved = localStorage.getItem('jrVotes');
    allVotes = saved ? JSON.parse(saved) : [];

    const firstUnanswered = firstUnansweredIdx();
    currentStep = firstUnanswered === -1 ? 3 : firstUnanswered + 1;

    renderFeaturedSurveys();
    document.addEventListener('jr:langchange', renderFeaturedSurveys);

    syncRemoteVotes();
  }

  // Every survey rendered on the homepage, by id — used to pull real
  // cross-browser votes from the shared backend (see js/vote-sync.js) when
  // one is configured. Without it, this is a no-op and results stay
  // this-browser-only, same as before.
  const ALL_SURVEY_IDS = [...SEQ.map(s => s.id), 'satisfaction', 'women_safety'];

  async function syncRemoteVotes() {
    if (!window.JrVoteSync || !JrVoteSync.isConfigured()) return;
    const results = await Promise.all(ALL_SURVEY_IDS.map(id => JrVoteSync.fetchRawVotes(id)));
    let changed = false;
    ALL_SURVEY_IDS.forEach((id, i) => {
      const remoteVotes = results[i];
      if (!remoteVotes) return;
      // A Google Apps Script Web App can have a moment of lag between a
      // doPost() finishing and a doGet() right after reflecting it. If this
      // browser's own just-cast vote hasn't propagated to the remote list
      // yet, replacing local data with it wholesale would make a vote that
      // definitely landed look like it never counted. This browser's own
      // vote always comes from the local copy; everyone else's from remote.
      const myLocalVote = allVotes.find(v => v.survey_id === id && v.voter_id === voterId);
      const merged = remoteVotes.filter(v => v.voter_id !== voterId);
      if (myLocalVote) merged.push(myLocalVote);
      allVotes = allVotes.filter(v => v.survey_id !== id).concat(merged);
      changed = true;
    });
    if (changed) renderFeaturedSurveys();
  }

  function destroyAll() {
    Object.values(charts).forEach(c => { if (c) c.destroy(); });
    Object.keys(charts).forEach(k => delete charts[k]);
  }

  /* ── Answer-state helpers (derived from persisted votes — no single "completed" flag) ── */

  function voted(surveyId) {
    return allVotes.some(v => v.survey_id === surveyId && v.voter_id === voterId);
  }

  function userVoteFor(surveyId) {
    return allVotes.find(v => v.survey_id === surveyId && v.voter_id === voterId);
  }

  function firstUnansweredIdx() {
    for (let i = 0; i < SEQ.length; i++) if (!voted(SEQ[i].id)) return i;
    return -1;
  }

  function isSequentialComplete() {
    return firstUnansweredIdx() === -1;
  }

  function answeredCount() {
    return SEQ.filter(s => voted(s.id)).length;
  }

  function pct(part, total) { return total ? Math.round(part / total * 100) : 0; }

  // "1 response" vs "124 responses" — English pluralizes, Hindi uses the same
  // word regardless of count (that's how the dictionary strings are written).
  function responseCountHTML(total, lang) {
    const t = k => jrT(k, lang);
    const word = (lang === 'en' && total === 1) ? t('survey.response') : t('survey.responses');
    return `${total.toLocaleString('en-IN')} ${esc(word)}`;
  }

  /* Unique respondents across the 3 sequential questions (a person who answers
     Q1 only still counts once here — this is a headcount of participants, not
     a sum of the three independent per-question totals, which would double- or
     triple-count anyone who answered more than one question). */
  function totalSequentialRespondents() {
    const voters = new Set();
    SEQ.forEach(cfg => allVotes.forEach(v => { if (v.survey_id === cfg.id) voters.add(v.voter_id); }));
    return voters.size;
  }

  /* Ranked horizontal bar list for multi-option questions (e.g. PM preference) —
     more readable at a glance than a 6-slice pie once there are more than 2-3
     options. `items` = [{name, count}], any order in; sorted here by count desc. */
  function rankBarListHTML(items, total) {
    const sorted = [...items].sort((a, b) => b.count - a.count);
    const maxCount = Math.max(1, ...sorted.map(i => i.count));
    return `<div class="rank-bar-list">${sorted.map((it, i) => {
      const widthPct = Math.max(2, Math.round(it.count / maxCount * 100));
      return `<div class="rank-bar-item">
        <span class="rank-bar-rank">${i + 1}</span>
        <span class="rank-bar-track">
          <span class="rank-bar-fill ${i === 0 ? 'rank-1' : 'rank-other'}" style="width:${widthPct}%"></span>
          <span class="rank-bar-name">${esc(it.name)}</span>
        </span>
        <span class="rank-bar-pct">${pct(it.count, total)}%</span>
      </div>`;
    }).join('')}</div>`;
  }

  /* ── Main render ──────────────────────────────────────── */

  function renderFeaturedSurveys() {
    destroyAll();
    const lang      = jrGetLang();
    const container = document.getElementById('featured-surveys-container');
    if (!container) return;
    const t = k => jrT(k, lang);

    container.innerHTML = `
      <section class="featured-surveys-section">
        <div class="container">
          <div class="featured-surveys-header">
            <span class="eyebrow"><span class="dot pulse"></span> <span>🗳️ ${esc(t('home.surveys'))}</span></span>
            <h2 class="section-title">${esc(t('home.featured.title'))}</h2>
            <p class="section-sub">${esc(t('home.featured.sub'))}</p>
          </div>

          <!-- Sequential 3-question survey -->
          <div class="featured-survey-card" id="sequential-survey-card">
            ${isSequentialComplete() ? renderOverallResults(lang) : renderStepFlow(lang)}
          </div>

          <!-- Satisfaction survey (standalone) -->
          <div class="featured-survey-card" data-survey="satisfaction">
            ${renderStandaloneYesNo('satisfaction', 'home.featured.satisfaction', lang)}
          </div>

          <!-- Women safety survey (standalone) -->
          <div class="featured-survey-card" data-survey="women_safety">
            ${renderStandaloneYesNo('women_safety', 'home.featured.women_safety', lang)}
          </div>
        </div>
      </section>`;

    wireAll();
  }

  /* ── Sequential step flow (not yet complete) ─────────────── */

  function renderStepFlow(lang) {
    const t = k => jrT(k, lang);

    const dot = n => {
      const isDone = voted(SEQ[n - 1].id);
      const isActive = n === currentStep;
      const cls = isDone ? 'done' : (isActive ? 'active' : '');
      const label = isDone ? '✓' : n;
      return `<span class="step-dot ${cls}" data-goto="${n}" style="cursor:pointer" title="${esc(t('survey.questionLabel'))} ${n}">${label}</span>`;
    };
    const line = n => `<span class="step-line${voted(SEQ[n - 1].id) ? ' done' : ''}"></span>`;

    const cfg = SEQ[currentStep - 1];
    const stepHTML = cfg.kind === 'candidates'
      ? renderPMQuestion(cfg, lang, currentStep)
      : renderYesNoQuestion(cfg, lang, currentStep);

    return `
      <div class="survey-step-indicator">
        ${dot(1)}${line(1)}${dot(2)}${line(2)}${dot(3)}
      </div>
      <div class="overall-results-label">${answeredCount()}/${SEQ.length} ${esc(t('survey.answered'))}</div>

      <div id="seq-step-${currentStep}" class="seq-step">${stepHTML}</div>

      <div class="seq-nav">
        <button class="btn btn-ghost seq-nav-btn" id="seq-prev-btn" ${currentStep === 1 ? 'disabled' : ''}>← ${esc(t('common.previous'))}</button>
        <span class="seq-nav-label">${esc(t('survey.questionLabel'))} ${currentStep} / 3</span>
        <button class="btn btn-ghost seq-nav-btn" id="seq-next-btn" ${currentStep === 3 || !voted(SEQ[currentStep - 1].id) ? 'disabled' : ''}>${esc(t('common.next'))} →</button>
      </div>`;
  }

  function renderYesNoQuestion(cfg, lang, stepNum) {
    const t = k => jrT(k, lang);
    const title = `<h3 class="featured-survey-title">${esc(t(cfg.titleKey))}</h3>`;
    const disclaimer = `<p class="featured-survey-disclaimer">${esc(t('home.featured.pm_disclaimer'))}</p>`;

    if (!voted(cfg.id)) {
      return `${title}${disclaimer}
        <div class="yesno-options compact" data-survey-id="${cfg.id}" data-dom="${cfg.dom}">
          <button class="yesno-option" data-option="yes">${esc(t('home.featured.yes'))}</button>
          <button class="yesno-option" data-option="no">${esc(t('home.featured.no'))}</button>
        </div>
        <div class="featured-survey-actions">
          <button class="btn btn-primary" id="${cfg.dom}-submit-btn" data-survey-id="${cfg.id}" disabled>${esc(t('home.featured.submit'))}</button>
        </div>`;
    }

    return title + disclaimer + yesNoResultPanel(cfg, lang, stepNum);
  }

  function yesNoResultPanel(cfg, lang, stepNum) {
    const t = k => jrT(k, lang);
    const votes = allVotes.filter(v => v.survey_id === cfg.id);
    const total = votes.length;
    const yesV  = votes.filter(v => v.selected_option === 'yes').length;
    const noV   = total - yesV;
    const uv    = userVoteFor(cfg.id);
    const yourLabel = uv ? (uv.selected_option === 'yes' ? t('home.featured.yes') : t('home.featured.no')) : null;
    const canvasId  = cfg.dom + '-chart-canvas';

    const continueBtn = (stepNum && stepNum < 3)
      ? `<div class="featured-survey-actions">
           <button class="btn btn-primary" data-continue-to="${stepNum + 1}">${esc(t('survey.continue'))} — ${esc(t('survey.questionLabel'))} ${stepNum + 1} →</button>
         </div>`
      : '';

    return `
      <div class="survey-result-panel">
        ${yourLabel ? `<div class="your-response-pill">${esc(t('survey.yourResponse'))}: <strong>${esc(yourLabel)}</strong></div>` : ''}
        <div class="survey-chart-wrap" data-chart-key="${cfg.dom}"><canvas id="${canvasId}"></canvas></div>
        <div class="featured-survey-results">
          <div class="result-item"><span class="result-label">${esc(t('home.featured.yes'))}</span><span class="result-stats"><span class="result-percentage">${pct(yesV, total)}%</span></span></div>
          <div class="result-item"><span class="result-label">${esc(t('home.featured.no'))}</span><span class="result-stats"><span class="result-percentage">${pct(noV, total)}%</span></span></div>
        </div>
        <div class="response-count">${responseCountHTML(total, lang)}</div>
        ${continueBtn}
      </div>
      ${scheduleChart(canvasId, cfg.dom, 'doughnut',
        [t('home.featured.yes'), t('home.featured.no')],
        [yesV, noV], ['#22c55e', '#ef4444'])}`;
  }

  function renderPMQuestion(cfg, lang, stepNum) {
    const t = k => jrT(k, lang);
    const title = `<h3 class="featured-survey-title">${esc(t(cfg.titleKey))}</h3>`;
    const disclaimer = `<p class="featured-survey-disclaimer">${esc(t('home.featured.pm_disclaimer'))}</p>`;

    if (!voted(cfg.id)) {
      return `${title}${disclaimer}
        <div class="pm-candidates-grid" id="pm-candidates-grid"></div>
        <div class="featured-survey-actions">
          <button class="btn btn-primary" id="pm-submit-btn" disabled>${esc(t('home.featured.submit'))}</button>
        </div>`;
    }

    const pmVotes = allVotes.filter(v => v.survey_id === cfg.id);
    const total   = pmVotes.length;
    const items   = PM_CANDIDATES.map(c => ({ name: c.name, count: pmVotes.filter(v => v.selected_option === c.id).length }));
    const uv      = userVoteFor(cfg.id);
    const yourCand = uv && PM_CANDIDATES.find(c => c.id === uv.selected_option);

    const continueBtn = stepNum < 3
      ? `<div class="featured-survey-actions">
           <button class="btn btn-primary" data-continue-to="${stepNum + 1}">${esc(t('survey.continue'))} — ${esc(t('survey.questionLabel'))} ${stepNum + 1} →</button>
         </div>`
      : '';

    return title + disclaimer + `
      <div class="survey-result-panel">
        ${yourCand ? `<div class="your-response-pill">${esc(t('survey.yourResponse'))}: <strong>${esc(yourCand.name)}</strong></div>` : ''}
        ${rankBarListHTML(items, total)}
        <div class="response-count">${responseCountHTML(total, lang)}</div>
        ${continueBtn}
      </div>`;
  }

  /* ── Overall Results / Survey Completed ──────────────────── */

  function renderOverallResults(lang) {
    const t = k => jrT(k, lang);
    const cards = SEQ.map((cfg, i) => overallResultCard(cfg, lang, i)).join('');

    return `
      <div class="survey-completed-header">
        <div class="survey-completed-check">✓</div>
        <div class="survey-completed-title">${esc(t('survey.completed'))}</div>
        <div class="survey-completed-sub">${esc(t('survey.thankYou'))} ${esc(t('survey.responsesRecorded'))}</div>
      </div>

      <div class="survey-summary-row">
        <div class="survey-summary-tile">
          <span class="survey-summary-value">${totalSequentialRespondents().toLocaleString('en-IN')}</span>
          <span class="survey-summary-label">${esc(t('survey.totalResponses'))}</span>
        </div>
        <div class="survey-summary-tile">
          <span class="survey-summary-value">${SEQ.length}</span>
          <span class="survey-summary-label">${esc(t('survey.questions'))}</span>
        </div>
        <div class="survey-summary-tile">
          <span class="survey-summary-value">${answeredCount()}/${SEQ.length}</span>
          <span class="survey-summary-label">${esc(t('survey.yourResponses'))}</span>
        </div>
      </div>

      <div class="overall-results-label">${esc(t('survey.overallResults'))}</div>
      <div class="overall-results-grid">${cards}</div>

      ${renderRegionSection(lang)}`;
  }

  /* Regional participation section — see notes on renderRegionSection() below
     for exactly what data this can and cannot show today. */
  function renderRegionSection(lang) {
    const t = k => jrT(k, lang);
    return `
      <div class="region-section">
        <div class="overall-results-label">${esc(t('survey.responsesByRegion'))}</div>
        <div class="region-placeholder">${esc(t('survey.regionDataUnavailable'))}</div>
      </div>`;
  }

  function overallResultCard(cfg, lang, idx) {
    const t = k => jrT(k, lang);
    const canvasId = 'ovr-' + cfg.dom + '-chart-canvas';
    const uv = userVoteFor(cfg.id);

    if (cfg.kind === 'candidates') {
      const votes  = allVotes.filter(v => v.survey_id === cfg.id);
      const total  = votes.length;
      const items  = PM_CANDIDATES.map(c => ({ name: c.name, count: votes.filter(v => v.selected_option === c.id).length }));
      const yourCand = uv && PM_CANDIDATES.find(c => c.id === uv.selected_option);
      return `
        <div class="overall-result-card">
          <div class="overall-result-q">${esc(t('survey.questionLabel'))} ${idx + 1}</div>
          <div class="overall-result-title">${esc(t(cfg.titleKey))}</div>
          ${rankBarListHTML(items, total)}
          <div class="response-count">${responseCountHTML(total, lang)}</div>
          ${yourCand ? `<div class="your-response-pill">${esc(t('survey.yourAnswer'))}: <strong>${esc(yourCand.name)}</strong></div>` : ''}
        </div>`;
    }

    const votes = allVotes.filter(v => v.survey_id === cfg.id);
    const total = votes.length;
    const yesV  = votes.filter(v => v.selected_option === 'yes').length;
    const noV   = total - yesV;
    const yourLabel = uv ? (uv.selected_option === 'yes' ? t('home.featured.yes') : t('home.featured.no')) : null;

    return `
      <div class="overall-result-card">
        <div class="overall-result-q">${esc(t('survey.questionLabel'))} ${idx + 1}</div>
        <div class="overall-result-title">${esc(t(cfg.titleKey))}</div>
        <div class="survey-chart-wrap" data-chart-key="ovr-${cfg.dom}"><canvas id="${canvasId}"></canvas></div>
        <div class="result-list">
          <div class="result-item"><span class="result-label">${esc(t('home.featured.yes'))}</span><span class="result-stats"><span class="result-percentage">${pct(yesV, total)}%</span></span></div>
          <div class="result-item"><span class="result-label">${esc(t('home.featured.no'))}</span><span class="result-stats"><span class="result-percentage">${pct(noV, total)}%</span></span></div>
        </div>
        <div class="response-count">${responseCountHTML(total, lang)}</div>
        ${yourLabel ? `<div class="your-response-pill">${esc(t('survey.yourAnswer'))}: <strong>${esc(yourLabel)}</strong></div>` : ''}
      </div>
      ${scheduleChart(canvasId, 'ovr-' + cfg.dom, 'doughnut', [t('home.featured.yes'), t('home.featured.no')], [yesV, noV], ['#22c55e', '#ef4444'])}`;
  }

  /* ── Standalone yes/no surveys (satisfaction, women safety) ── */

  function renderStandaloneYesNo(surveyId, titleKey, lang) {
    const t = k => jrT(k, lang);
    const title = `<h3 class="featured-survey-title">${esc(t(titleKey))}</h3>`;

    if (!voted(surveyId)) {
      return `${title}
        <div class="yesno-options compact" data-survey-id="${surveyId}" data-dom="${surveyId}">
          <button class="yesno-option" data-option="yes">${esc(t('home.featured.yes'))}</button>
          <button class="yesno-option" data-option="no">${esc(t('home.featured.no'))}</button>
        </div>`;
    }

    const votes = allVotes.filter(v => v.survey_id === surveyId);
    const total = votes.length;
    const yesV  = votes.filter(v => v.selected_option === 'yes').length;
    const noV   = total - yesV;
    const uv    = userVoteFor(surveyId);
    const yourLabel = uv ? (uv.selected_option === 'yes' ? t('home.featured.yes') : t('home.featured.no')) : null;
    const canvasId = surveyId + '-chart-canvas';

    return title + `
      <div class="survey-result-panel">
        ${yourLabel ? `<div class="your-response-pill">${esc(t('survey.yourResponse'))}: <strong>${esc(yourLabel)}</strong></div>` : ''}
        <div class="survey-chart-wrap" data-chart-key="${surveyId}"><canvas id="${canvasId}"></canvas></div>
        <div class="featured-survey-results">
          <div class="result-item"><span class="result-label">${esc(t('home.featured.yes'))}</span><span class="result-stats"><span class="result-percentage">${pct(yesV, total)}%</span></span></div>
          <div class="result-item"><span class="result-label">${esc(t('home.featured.no'))}</span><span class="result-stats"><span class="result-percentage">${pct(noV, total)}%</span></span></div>
        </div>
        <div class="response-count">${responseCountHTML(total, lang)}</div>
      </div>
      ${scheduleChart(canvasId, surveyId, 'doughnut', [t('home.featured.yes'), t('home.featured.no')], [yesV, noV], ['#22c55e', '#ef4444'])}`;
  }

  /* ── Wiring (event handlers) ──────────────────────────────── */

  function wireAll() {
    // Sequential nav
    document.getElementById('seq-prev-btn')?.addEventListener('click', () => { currentStep = Math.max(1, currentStep - 1); renderFeaturedSurveys(); });
    document.getElementById('seq-next-btn')?.addEventListener('click', () => { currentStep = Math.min(3, currentStep + 1); renderFeaturedSurveys(); });
    document.querySelectorAll('.step-dot[data-goto]').forEach(d => {
      d.addEventListener('click', () => {
        const n = parseInt(d.dataset.goto, 10);
        const firstUnanswered = firstUnansweredIdx();
        const maxReachable = firstUnanswered === -1 ? SEQ.length : firstUnanswered + 1;
        if (n > maxReachable) return; // can't skip ahead of an unanswered question
        currentStep = n;
        renderFeaturedSurveys();
      });
    });
    document.querySelectorAll('[data-continue-to]').forEach(b => {
      b.addEventListener('click', () => { currentStep = parseInt(b.dataset.continueTo, 10); renderFeaturedSurveys(); });
    });

    // Yes/No option groups (sequential steps + standalone surveys)
    document.querySelectorAll('.yesno-options[data-survey-id]').forEach(wrap => {
      const surveyId = wrap.dataset.surveyId;
      const dom = wrap.dataset.dom;
      const submitBtn = document.getElementById(dom + '-submit-btn'); // present for sequential steps only
      let selected = null;

      wrap.querySelectorAll('.yesno-option').forEach(btn => {
        btn.addEventListener('click', () => {
          wrap.querySelectorAll('.yesno-option').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selected = btn.dataset.option;
          if (submitBtn) {
            submitBtn.disabled = false;
          } else {
            // Standalone survey: single click submits immediately.
            saveVote(surveyId, selected);
            renderFeaturedSurveys();
          }
        });
      });

      if (submitBtn) {
        submitBtn.addEventListener('click', () => {
          if (!selected) return;
          saveVote(surveyId, selected);
          renderFeaturedSurveys();
        });
      }
    });

    // PM candidate grid (only present when pm_preference not yet answered)
    setupPMCandidateGrid();

    // Render any charts scheduled by the HTML builders above.
    flushScheduledCharts();
  }

  function setupPMCandidateGrid() {
    const grid = document.getElementById('pm-candidates-grid');
    if (!grid) return; // already answered — result view has no grid

    grid.innerHTML = PM_CANDIDATES.map(c => {
      const photoHTML = c.photo === 'CROSS'
        ? '<div class="cand-cross">✕</div>'
        : '<img src="' + c.photo + '" alt="' + esc(c.name) + '">';
      return `<div class="candidate-card" data-candidate-id="${c.id}" role="button" tabindex="0" aria-pressed="false">
        <div class="candidate-photo">${photoHTML}</div>
        <div class="candidate-name">${esc(c.name)}</div>
        ${c.party ? `<div class="candidate-party">${esc(c.party)}</div>` : ''}
      </div>`;
    }).join('');

    const submitBtn = document.getElementById('pm-submit-btn');
    const select = id => {
      grid.querySelectorAll('.candidate-card').forEach(card => {
        const on = card.dataset.candidateId === id;
        card.classList.toggle('selected', on);
        card.setAttribute('aria-pressed', String(on));
      });
      grid.dataset.selected = id;
      if (submitBtn) submitBtn.disabled = false;
    };

    grid.querySelectorAll('.candidate-card').forEach(card => {
      card.addEventListener('click', () => select(card.dataset.candidateId));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(card.dataset.candidateId); }
      });
    });

    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const selectedId = grid.dataset.selected;
        if (!selectedId) return;
        saveVote('pm_preference', selectedId);
        renderFeaturedSurveys();
      });
    }
  }

  /* ── Vote submission (prevents duplicate votes per voter) ── */

  function saveVote(surveyId, option) {
    if (voted(surveyId)) return;
    allVotes.push({
      id: 'vote_' + Date.now(),
      survey_id: surveyId,
      voter_id: voterId,
      selected_option: option,
      created_at: new Date().toISOString()
    });
    // allVotes may also hold OTHER people's votes merged in from the shared
    // backend (see syncRemoteVotes) — persist only this browser's own, or
    // localStorage would fill up with everyone else's votes too.
    localStorage.setItem('jrVotes', JSON.stringify(allVotes.filter(v => v.voter_id === voterId)));
    jrToast(jrT('home.featured.vote_submitted'));

    // Push to the shared Google Sheet backend (if configured) so this vote
    // counts toward everyone's results, then pull the updated real tally.
    if (window.JrVoteSync && JrVoteSync.isConfigured()) {
      JrVoteSync.submitVote(surveyId, voterId, option).then(() => syncRemoteVotes());
    }
  }

  /* ── Chart rendering (deferred until after innerHTML is attached) ── */

  let pendingCharts = [];

  function scheduleChart(canvasId, chartKey, type, labels, data, colors) {
    pendingCharts.push({ canvasId, chartKey, type, labels, data, colors });
    return ''; // markup already emitted the <canvas>; this just queues the render
  }

  function flushScheduledCharts() {
    const queue = pendingCharts;
    pendingCharts = [];
    queue.forEach(({ canvasId, chartKey, type, labels, data, colors }) => {
      const canvas = document.getElementById(canvasId);
      if (!canvas || !window.Chart) return;
      const total = data.reduce((a, b) => a + b, 0);
      if (!total) { showNoVotes(canvas); return; }
      if (charts[chartKey]) { charts[chartKey].destroy(); }
      charts[chartKey] = new Chart(canvas, {
        type,
        data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: CHART_BG, borderWidth: 2 }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => ' ' + ctx.raw.toLocaleString('en-IN') + ' (' + pct(ctx.raw, total) + '%)'
              }
            }
          }
        }
      });
    });
  }

  function showNoVotes(canvas) {
    const parent = canvas.parentElement;
    if (!parent || parent.querySelector('.no-votes-msg')) return;
    const msg = document.createElement('p');
    msg.className = 'no-votes-msg';
    msg.textContent = jrT('home.featured.no_votes', jrGetLang());
    parent.appendChild(msg);
  }

  /* ── Helpers ──────────────────────────────────────────── */

  function getVoterId() {
    let id = localStorage.getItem('jrVoterId');
    if (!id) {
      id = 'voter_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
      localStorage.setItem('jrVoterId', id);
    }
    return id;
  }

  function esc(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => FeaturedSurveys.init());
