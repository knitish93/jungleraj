/* =========================================================
   surveys.js — Public surveys page
   Loads: surveys.json, votes.json
   Renders: survey cards, voting UI, results charts
   ========================================================= */
'use strict';

const SurveysPage = (() => {
  let allSurveys = [];
  let allVotes = [];
  let filteredSurveys = [];
  let currentFilter = 'all';
  let currentSearchQuery = '';
  let currentSort = 'recent';

  // survey.category in the data is English-only (no category_hi field) — this
  // maps it to a Hindi label for display only; the English value stays the
  // filter/search key so behaviour doesn't change with language.
  const CATEGORY_HI = {
    'Agriculture': 'कृषि', 'Central Government': 'केंद्र सरकार', 'Corruption': 'भ्रष्टाचार',
    'Economy': 'अर्थव्यवस्था', 'Education': 'शिक्षा', 'Employment': 'रोज़गार',
    'Environment': 'पर्यावरण', 'Fuel': 'ईंधन', 'Healthcare': 'स्वास्थ्य सेवा',
    'Infrastructure': 'बुनियादी ढांचा', 'Law & Order': 'कानून व्यवस्था', 'Migration': 'प्रवासन',
    'Politics': 'राजनीति', 'State Government': 'राज्य सरकार', 'Tax': 'कर',
    'Technology': 'प्रौद्योगिकी', "Women's Safety": 'महिला सुरक्षा',
  };
  function categoryLabel(cat, lang) {
    lang = lang || jrGetLang();
    return lang === 'hi' ? (CATEGORY_HI[cat] || cat) : cat;
  }

  /* ══════════════════════════════════════════════════════
     BOOT
  ══════════════════════════════════════════════════════ */
  async function init() {
    if (!document.getElementById('surveys-grid')) return;

    try {
      // Load data
      allSurveys = await jrLoadData('surveys.json').catch(() => []);

      // Load votes from localStorage (which persists user votes)
      // votes.json is the server source; localStorage is the client-side record
      const localVotes = localStorage.getItem('jrVotes');
      allVotes = localVotes ? JSON.parse(localVotes) : [];

      // Initialize
      renderStatistics();
      setupCategoryFilter();
      renderSurveys();
      setupSearch();
      setupSort();

      // Listen for language changes
      document.addEventListener('jr:langchange', () => {
        renderSurveys();
        renderStatistics();
        document.querySelectorAll('.category-pill').forEach(btn => {
          btn.textContent = categoryLabel(btn.dataset.category);
        });
      });
    } catch (err) {
      console.error('Error loading surveys:', err);
    }
  }

  /* ── Statistics ──────────────────────────────────────── */
  function renderStatistics() {
    const totalCount = allSurveys.length;
    const activeCount = allSurveys.filter(s => s.status === 'active').length;
    const bookmarkedCount = Object.keys(localStorage)
      .filter(k => k.startsWith('bookmark_survey_')).length;

    document.getElementById('total-surveys').textContent = totalCount;
    document.getElementById('active-surveys').textContent = activeCount;
    document.getElementById('total-votes').textContent = allVotes.length.toLocaleString('en-IN');
    document.getElementById('bookmarked-surveys').textContent = bookmarkedCount;

    // If a shared backend is configured, replace the this-browser-only vote
    // count with the real total across everyone once it arrives.
    if (window.JrVoteSync && JrVoteSync.isConfigured()) {
      JrVoteSync.fetchAllTallies().then(data => {
        if (data) document.getElementById('total-votes').textContent = data.totalVotes.toLocaleString('en-IN');
      });
    }
  }

  /* ── Category Filter ─────────────────────────────────── */
  function setupCategoryFilter() {
    const container = document.getElementById('survey-categories');
    if (!container) return;

    // Get unique categories
    const categories = new Set();
    allSurveys.forEach(s => {
      if (s.category) categories.add(s.category);
    });

    // Add category buttons
    const sortedCats = Array.from(categories).sort();
    sortedCats.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'category-pill';
      btn.textContent = categoryLabel(cat);
      btn.dataset.category = cat;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = cat;
        renderSurveys();
      });
      container.appendChild(btn);
    });
  }

  /* ── Survey Rendering ────────────────────────────────── */
  // Recomputes filteredSurveys from category + search + sort (all three
  // combine), then renders. Category pills, the search box, and the sort
  // dropdown all funnel through here so none of them can silently discard
  // what the others just did.
  function renderSurveys() {
    filteredSurveys = computeFilteredSurveys();
    renderGrid();
  }

  function computeFilteredSurveys() {
    const lang = jrGetLang();
    let result = allSurveys.filter(s =>
      currentFilter === 'all' || s.category === currentFilter
    );

    if (currentSearchQuery) {
      const q = currentSearchQuery;
      result = result.filter(s => {
        const title = lang === 'en' ? (s.title_en || s.title) : s.title;
        const desc = lang === 'en' ? (s.description_en || s.description) : s.description;
        return (
          title.toLowerCase().includes(q) ||
          (desc && desc.toLowerCase().includes(q)) ||
          s.category.toLowerCase().includes(q)
        );
      });
    }

    return sortSurveys(result, currentSort);
  }

  function sortSurveys(list, sortBy) {
    const arr = [...list];
    if (sortBy === 'trending' || sortBy === 'most-votes') {
      arr.sort((a, b) => calculateSurveyVotes(b.id) - calculateSurveyVotes(a.id));
    } else {
      // Recent: newest id first
      arr.sort((a, b) => parseInt(b.id.replace(/\D/g, ''), 10) - parseInt(a.id.replace(/\D/g, ''), 10));
    }
    return arr;
  }

  function renderGrid() {
    const lang = jrGetLang();
    const grid = document.getElementById('surveys-grid');
    if (!grid) return;

    if (filteredSurveys.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: var(--sp-8)">
          <div style="font-size: 3rem; margin-bottom: var(--sp-4)">📋</div>
          <h3 data-i18n="common.noResults">कोई परिणाम नहीं मिला</h3>
          <p data-i18n="common.noResultsSub" style="color: var(--color-text-muted)">अपनी खोज या फ़िल्टर बदलकर पुनः प्रयास करें।</p>
        </div>
      `;
      jrApplyLang(lang);
      return;
    }

    grid.innerHTML = filteredSurveys.map(survey => createSurveyCard(survey, lang)).join('');

    // Add click handlers
    grid.querySelectorAll('.survey-card').forEach(card => {
      card.addEventListener('click', () => {
        const surveyId = card.dataset.surveyId;
        openSurveyModal(surveyId, lang);
      });
    });
  }

  function createSurveyCard(survey, lang) {
    const title = lang === 'en' ? (survey.title_en || survey.title) : survey.title;
    const voteCount = calculateSurveyVotes(survey.id);
    const isBookmarked = localStorage.getItem(`bookmark_survey_${survey.id}`) === 'true';

    return `
      <div class="survey-card" data-survey-id="${survey.id}">
        <div class="survey-card-header">
          <span class="survey-badge">${categoryLabel(survey.category, lang)}</span>
          <button class="bookmark-btn ${isBookmarked ? 'bookmarked' : ''}"
                  onclick="event.stopPropagation(); SurveysPage.toggleBookmark('${survey.id}', this)">
            ${isBookmarked ? '❤️' : '🤍'}
          </button>
        </div>
        <h3 class="survey-title">${escapeHtml(title)}</h3>
        <div class="survey-stats">
          <span>🗳️ ${voteCount.toLocaleString('en-IN')} ${lang === 'en' ? 'votes' : 'मत'}</span>
        </div>
        <div class="survey-cta">
          <button class="btn btn-primary" onclick="event.stopPropagation(); SurveysPage.openSurveyModal('${survey.id}', '${lang}')">
            ${lang === 'en' ? 'Take Survey' : 'सर्वेक्षण लें'}
          </button>
          <button class="btn btn-ghost" onclick="event.stopPropagation(); SurveysPage.openSurveyModal('${survey.id}', '${lang}')">
            ${escapeHtml(lang === 'en' ? 'View results' : 'परिणाम देखें')}
          </button>
        </div>
      </div>
    `;
  }

  function calculateSurveyVotes(surveyId) {
    return allVotes.filter(v => v.survey_id === surveyId).length;
  }

  // Pulls this survey's real cross-browser votes (if a backend is
  // configured) and merges them into allVotes, then re-renders whatever's
  // showing its results.
  //
  // Merges by voter_id rather than trusting the remote list wholesale: a
  // Google Apps Script Web App (or this file's local test mock) can have a
  // moment of lag between a doPost() finishing and a doGet() right after
  // reflecting it — if the vote just cast by THIS browser hasn't
  // propagated yet, replacing local data with an incomplete remote list
  // would make a vote that definitely landed look like it never counted.
  // The current voter's own local entry always wins that gap; everyone
  // else's votes come from the remote list.
  async function syncSurveyVotes(surveyId) {
    if (!window.JrVoteSync || !JrVoteSync.isConfigured()) return;
    const remoteVotes = await JrVoteSync.fetchRawVotes(surveyId);
    if (!remoteVotes) return;
    const myVoterId = getVoterId();
    const myLocalVote = allVotes.find(v => v.survey_id === surveyId && v.voter_id === myVoterId);
    const merged = remoteVotes.filter(v => v.voter_id !== myVoterId);
    if (myLocalVote) merged.push(myLocalVote);
    allVotes = allVotes.filter(v => v.survey_id !== surveyId).concat(merged);
    refreshModal(surveyId, jrGetLang());
    renderSurveys();
  }

  /* ── Search ──────────────────────────────────────────── */
  function setupSearch() {
    const searchInput = document.getElementById('surveys-search');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.toLowerCase();
      renderSurveys();
    });
  }

  /* ── Sort ────────────────────────────────────────────── */
  function setupSort() {
    const sortSelect = document.getElementById('surveys-sort');
    if (!sortSelect) return;

    sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      renderSurveys();
    });
  }

  /* ── Voting Modal ────────────────────────────────────── */
  // Tracks the option a user has clicked but not yet confirmed with the
  // "Submit Vote" button — keyed by survey id, cleared once the vote lands
  // (or the modal is closed). Voting requires this explicit confirm step so
  // selecting an option is never mistaken for casting the vote itself.
  const pendingSelection = {};

  async function openSurveyModal(surveyId, lang) {
    lang = lang || jrGetLang();
    delete pendingSelection[surveyId];

    if (window.JrVoteSync && JrVoteSync.isConfigured()) {
      const remoteVotes = await JrVoteSync.fetchRawVotes(surveyId);
      if (remoteVotes) {
        const myVoterId = getVoterId();
        const myLocalVote = allVotes.find(v => v.survey_id === surveyId && v.voter_id === myVoterId);
        const merged = remoteVotes.filter(v => v.voter_id !== myVoterId);
        if (myLocalVote) merged.push(myLocalVote);
        allVotes = allVotes.filter(v => v.survey_id !== surveyId).concat(merged);
      }
    }

    const overlay = document.createElement('div');
    overlay.className = 'survey-modal-overlay';
    overlay.dataset.surveyId = surveyId;
    overlay.innerHTML = buildModalContent(surveyId, lang);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  function refreshModal(surveyId, lang) {
    const overlay = document.querySelector(`.survey-modal-overlay[data-survey-id="${surveyId}"]`);
    if (!overlay) return;
    overlay.innerHTML = buildModalContent(surveyId, lang);
  }

  function buildModalContent(surveyId, lang) {
    const survey = allSurveys.find(s => s.id === surveyId);
    if (!survey) return '';

    const title = lang === 'en' ? (survey.title_en || survey.title) : survey.title;
    const desc = lang === 'en' ? (survey.description_en || survey.description) : survey.description;

    const hasVoted = allVotes.some(v => v.survey_id === surveyId && v.voter_id === getVoterId());
    const voteCount = calculateSurveyVotes(surveyId);

    return `
      <div class="survey-modal-content">
        <div class="modal-header">
          <h2>${escapeHtml(title)}</h2>
          <button class="modal-close" onclick="this.closest('.survey-modal-overlay').remove()">✕</button>
        </div>

        <div class="modal-body">
          <p class="survey-description">${escapeHtml(desc)}</p>

          ${hasVoted ? `
            <div class="already-voted-banner">
              ✓ ${lang === 'en' ? "Your vote has been recorded" : 'आपका मत दर्ज हो गया है'}
            </div>
          ` : ''}

          <div class="survey-options">
            ${renderVotingOptions(survey, lang, hasVoted, surveyId)}
          </div>

          ${!hasVoted ? `
            <div class="survey-vote-actions">
              <button class="btn btn-primary" id="submit-vote-btn" disabled
                      onclick="SurveysPage.confirmVote('${surveyId}')">
                ${lang === 'en' ? 'Submit Vote' : 'मत सबमिट करें'}
              </button>
            </div>
          ` : ''}

          <div class="survey-results">
            ${renderResults(survey, lang)}
          </div>
        </div>

        <div class="modal-footer">
          <span class="vote-count">
            ${voteCount.toLocaleString('en-IN')} ${lang === 'en' ? 'votes' : 'मत'}
          </span>
          <button class="btn btn-ghost" onclick="this.closest('.survey-modal-overlay').remove()">
            ${lang === 'en' ? 'Close' : 'बंद करें'}
          </button>
        </div>
      </div>
    `;
  }

  function renderVotingOptions(survey, lang, hasVoted, surveyId) {
    if (!survey.options || survey.options.length === 0) {
      return `<p style="color: var(--color-text-muted)">
        ${lang === 'en' ? 'No voting options available' : 'कोई मतदान विकल्प उपलब्ध नहीं'}
      </p>`;
    }

    const voterId = getVoterId();
    const userVote = allVotes.find(v => v.survey_id === surveyId && v.voter_id === voterId);
    const selected = hasVoted ? (userVote && userVote.selected_option) : pendingSelection[surveyId];

    return survey.options.map(option => {
      const label = lang === 'en' ? (option.label_en || option.label) : option.label;
      const isSelected = selected === option.id;

      return `
        <label class="vote-option ${isSelected ? 'selected' : ''} ${hasVoted ? 'disabled' : ''}">
          <input type="radio" name="vote_${surveyId}" value="${option.id}"
                 ${isSelected ? 'checked' : ''} ${hasVoted ? 'disabled' : ''}
                 onchange="SurveysPage.selectOption('${surveyId}', '${option.id}')">
          <span>${escapeHtml(label)}</span>
        </label>
      `;
    }).join('');
  }

  // Marks a pending selection (visual only — no vote is cast yet) and
  // enables the Submit Vote button once something is chosen.
  function selectOption(surveyId, optionId) {
    pendingSelection[surveyId] = optionId;
    const overlay = document.querySelector(`.survey-modal-overlay[data-survey-id="${surveyId}"]`);
    if (!overlay) return;
    overlay.querySelectorAll('.vote-option').forEach(label => {
      label.classList.toggle('selected', label.querySelector('input')?.value === optionId);
    });
    const submitBtn = overlay.querySelector('#submit-vote-btn');
    if (submitBtn) submitBtn.disabled = false;
  }

  function confirmVote(surveyId) {
    const optionId = pendingSelection[surveyId];
    if (!optionId) return;
    submitVote(surveyId, optionId);
  }

  function renderResults(survey, lang) {
    if (!survey.options || survey.options.length === 0) return '';

    const totalVotes = calculateSurveyVotes(survey.id);
    if (totalVotes === 0) {
      return `<div style="color: var(--color-text-muted); text-align: center; padding: var(--sp-4)">
        ${lang === 'en' ? 'No votes yet' : 'अभी कोई मत नहीं'}
      </div>`;
    }

    // Every survey's results render as a donut chart (with the breakdown
    // table below it), regardless of how many options it has.
    return renderPieChart(survey, lang);
  }

  function renderPieChart(survey, lang) {
    const chartCanvas = `chart_${survey.id}`;
    setTimeout(() => {
      const canvas = document.querySelector(`canvas[data-chart="${chartCanvas}"]`);
      if (!canvas || !window.Chart) return;
      // refreshModal() can run twice in quick succession right after voting
      // (once immediately with local data, again once the remote sync
      // resolves) — each schedules a chart here, so the canvas may already
      // have one attached by the time this fires.
      Chart.getChart(canvas)?.destroy();

      const labels = survey.options.map(o =>
        lang === 'en' ? (o.label_en || o.label) : o.label
      );
      const data = survey.options.map(o => calculateOptionVotes(survey.id, o.id));
      const total = data.reduce((a, b) => a + b, 0);

      new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: ['#c1272d', '#ff9933', '#2255a4', '#128807', '#a78bfa'],
            borderColor: 'var(--color-bg)',
            borderWidth: 2,
            hoverOffset: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                usePointStyle: true,
                padding: 16,
                color: 'var(--color-text)'
              }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const pct = ((ctx.parsed / total) * 100).toFixed(1);
                  return `${ctx.label}: ${ctx.parsed} (${pct}%)`;
                }
              }
            }
          }
        }
      });
    }, 100);

    return `
      <div style="position: relative; height: 300px; margin-top: var(--sp-6)">
        <canvas data-chart="${chartCanvas}"></canvas>
      </div>
      <div class="results-table">
        ${survey.options.map(o => {
          const votes = calculateOptionVotes(survey.id, o.id);
          const total = calculateSurveyVotes(survey.id);
          const pct = total > 0 ? ((votes / total) * 100).toFixed(1) : 0;
          const label = lang === 'en' ? (o.label_en || o.label) : o.label;
          return `
            <div class="result-row">
              <span>${escapeHtml(label)}</span>
              <span>${votes.toLocaleString('en-IN')} (${pct}%)</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function calculateOptionVotes(surveyId, optionId) {
    return allVotes.filter(v => v.survey_id === surveyId && v.selected_option === optionId).length;
  }

  /* ── Voting ──────────────────────────────────────────── */
  function submitVote(surveyId, optionId) {
    const voterId = getVoterId();

    // Check if already voted
    if (allVotes.some(v => v.survey_id === surveyId && v.voter_id === voterId)) {
      jrToast(jrT('surveys.alreadyVoted'));
      return;
    }

    // Add vote
    const vote = {
      id: `vote_${Date.now()}`,
      survey_id: surveyId,
      voter_id: voterId,
      selected_option: optionId,
      created_at: new Date().toISOString()
    };

    allVotes.push(vote);
    // allVotes may also hold OTHER people's votes merged in from the
    // shared backend (see openSurveyModal/syncSurveyVotes) — persist only
    // this browser's own votes, or localStorage would fill up with
    // everyone else's and corrupt the "has this browser voted" checks.
    localStorage.setItem('jrVotes', JSON.stringify(allVotes.filter(v => v.voter_id === voterId)));
    delete pendingSelection[surveyId];

    // Refresh UI — update the open modal in place (no abrupt close/reopen)
    // and re-render the card grid so its vote count reflects the new total.
    renderStatistics();
    renderSurveys();
    jrToast(jrT('surveys.vote'));
    refreshModal(surveyId, jrGetLang());

    // Push to the shared Google Sheet backend (if configured) so this vote
    // counts toward everyone's results, not just this browser's local copy.
    if (window.JrVoteSync && JrVoteSync.isConfigured()) {
      JrVoteSync.submitVote(surveyId, voterId, optionId).then(() => syncSurveyVotes(surveyId));
    }
  }

  /* ── Bookmarking ─────────────────────────────────────── */
  function toggleBookmark(surveyId, btn) {
    const isBookmarked = localStorage.getItem(`bookmark_survey_${surveyId}`) === 'true';
    if (isBookmarked) {
      localStorage.removeItem(`bookmark_survey_${surveyId}`);
      btn.textContent = '🤍';
      btn.classList.remove('bookmarked');
    } else {
      localStorage.setItem(`bookmark_survey_${surveyId}`, 'true');
      btn.textContent = '❤️';
      btn.classList.add('bookmarked');
    }
    renderStatistics();
  }

  /* ── Helpers ─────────────────────────────────────────── */
  function getVoterId() {
    let voterId = localStorage.getItem('jrVoterId');
    if (!voterId) {
      voterId = `voter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('jrVoterId', voterId);
    }
    return voterId;
  }

  function escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  // Export public methods
  return {
    init,
    openSurveyModal,
    selectOption,
    confirmVote,
    submitVote,
    toggleBookmark
  };
})();

document.addEventListener('DOMContentLoaded', () => SurveysPage.init());
