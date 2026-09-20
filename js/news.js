/* =========================================================
   news.js — news listing with category filter and search
   ========================================================= */

const jrNews = { all: [], category: 'all' };

// Same palette used for category coloring elsewhere (politicians.js, statistics.js)
// — deterministic per category name so a given category always gets the same tint.
const NEWS_CATEGORY_COLORS = ['#c1272d','#ff9933','#2255a4','#128807','#a78bfa','#0d9488','#f59e0b','#67e8f9'];
function categoryColor(category) {
  if (!category) return NEWS_CATEGORY_COLORS[0];
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return NEWS_CATEGORY_COLORS[hash % NEWS_CATEGORY_COLORS.length];
}

document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('news-grid');
  if (!grid) return;

  grid.innerHTML = jrSkeletonCards(6);
  jrNews.all = await jrMinDelay(jrLoadData('news.json'));

  buildCategoryBar();
  renderNews();

  document.getElementById('news-search')?.addEventListener('input', renderNews);
  document.addEventListener('jr:langchange', () => {
    const allChip = document.querySelector('#news-category-bar [data-category="all"]');
    if (allChip) allChip.textContent = jrT('common.all');
    renderNews();
  });

  grid.addEventListener('click', e => {
    const card = e.target.closest('[data-id]');
    if (card) openNewsModal(card.dataset.id);
  });
});

function buildCategoryBar() {
  const bar = document.getElementById('news-category-bar');
  if (!bar) return;
  const categories = ['all', ...new Set(jrNews.all.map(n => n.category).filter(Boolean))];
  bar.innerHTML = categories.map(c => `<button class="chip ${c === 'all' ? 'active' : ''}" data-category="${jrEscape(c)}">${c === 'all' ? jrT('common.all') : jrEscape(c)}</button>`).join('');
  bar.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      bar.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      jrNews.category = chip.getAttribute('data-category');
      renderNews();
    });
  });
}

function renderNews() {
  const grid = document.getElementById('news-grid');
  if (!grid) return;
  const q = document.getElementById('news-search')?.value.trim().toLowerCase() || '';

  const filtered = jrNews.all.filter(n => {
    const inCategory = jrNews.category === 'all' || n.category === jrNews.category;
    const inQuery = !q || [n.title, n.title_en, n.summary, n.summary_en].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    return inCategory && inQuery;
  });

  if (filtered.length === 0) {
    grid.innerHTML = jrEmptyState({ icon: 'search', titleKey: jrNews.all.length ? 'common.noResults' : 'common.comingSoon', subKey: jrNews.all.length ? 'common.noResultsSub' : 'common.comingSoonSub' });
    return;
  }

  grid.innerHTML = filtered.map(newsCardHtml).join('');
}

function newsCardHtml(item) {
  const lang    = jrGetLang();
  const title   = lang === 'en' ? (item.title_en || item.title || '') : (item.title || '');
  const summary = lang === 'en' ? (item.summary_en || item.summary || '') : (item.summary || item.summary_en || '');
  const color   = categoryColor(item.category);
  return `
    <article class="card news-card" data-id="${jrEscape(item.id)}" style="cursor:pointer">
      <div class="news-thumb" style="font-size:3rem;background:linear-gradient(135deg, ${color}33, ${color}11)">${item.icon || jrIcon('inbox', 28)}</div>
      ${item.category ? `<span class="badge badge-saffron">${jrEscape(item.category)}</span>` : ''}
      <h3 class="news-title">${jrEscape(title)}</h3>
      <p class="news-excerpt">${jrEscape(summary)}</p>
      <div class="news-meta">
        <span>${jrEscape(item.source || '')}</span>
        <span>${jrEscape(item.date || '')}</span>
      </div>
    </article>`;
}

/* ── Detail modal (no per-article source URL exists in the data, so this
   surfaces the full existing summary/source/date in-page instead of
   linking out) ───────────────────────────────────────────────────── */
function openNewsModal(id) {
  const item = jrNews.all.find(n => n.id === id);
  if (!item) return;
  const lang    = jrGetLang();
  const title   = lang === 'en' ? (item.title_en || item.title || '') : (item.title || '');
  const summary = lang === 'en' ? (item.summary_en || item.summary || '') : (item.summary || item.summary_en || '');
  const color   = categoryColor(item.category);

  const overlay = document.createElement('div');
  overlay.className = 'news-modal-overlay';
  overlay.innerHTML = `
    <div class="news-modal-content">
      <div class="modal-header">
        <h2>${jrEscape(title)}</h2>
        <button class="modal-close" onclick="this.closest('.news-modal-overlay').remove()">✕</button>
      </div>
      <div class="modal-body">
        <div style="font-size:3rem;width:72px;height:72px;border-radius:var(--radius-md);display:grid;place-items:center;margin-bottom:var(--sp-4);background:linear-gradient(135deg, ${color}33, ${color}11)">${item.icon || ''}</div>
        ${item.category ? `<span class="badge badge-saffron">${jrEscape(item.category)}</span>` : ''}
        <p style="margin-top:var(--sp-4);color:var(--color-text-muted)">${jrEscape(summary)}</p>
      </div>
      <div class="modal-footer">
        <span style="font-size:var(--fs-sm);color:var(--color-text-muted)">${jrEscape(item.source || '')} · ${jrEscape(item.date || '')}</span>
        <button class="btn btn-ghost" onclick="this.closest('.news-modal-overlay').remove()">${jrEscape(jrT('common.close', lang))}</button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}
