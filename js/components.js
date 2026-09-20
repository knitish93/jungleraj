/* =========================================================
   components.js — shared render helpers used across pages
   ========================================================= */

/** Escapes text for safe HTML insertion. */
function jrEscape(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

/** Returns an empty-state HTML block (no results / no data yet). */
function jrEmptyState({ icon = 'inbox', titleKey = 'common.comingSoon', subKey = 'common.comingSoonSub' } = {}) {
  return `
    <div class="empty-state reveal in-view">
      ${jrIcon(icon, 40)}
      <h3 data-i18n="${titleKey}">${jrT(titleKey)}</h3>
      <p data-i18n="${subKey}">${jrT(subKey)}</p>
    </div>`;
}

/** Returns a grid of skeleton loading cards. */
function jrSkeletonCards(count = 6) {
  return Array.from({ length: count })
    .map(() => `<div class="card skeleton skeleton-card" aria-hidden="true"></div>`)
    .join('');
}

/** Minimal inline icon set (stroke-based, currentColor) so no icon font/library is required. */
function jrIcon(name, size = 20) {
  const icons = {
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    play: '<polygon points="5 3 19 12 5 21 5 3"/>',
    pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
    bookmark: '<path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/>',
    verified: '<path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="10"/>',
    chakra: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.6"/>' + Array.from({length:12}).map((_,i)=>`<line x1="12" y1="12" x2="${(12+9*Math.cos(i*Math.PI/6)).toFixed(2)}" y2="${(12+9*Math.sin(i*Math.PI/6)).toFixed(2)}"/>`).join(''),
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.inbox}</svg>`;
}

/** Builds pagination controls; onPage receives 1-indexed page number. */
function jrRenderPagination(container, totalItems, pageSize, currentPage, onPage) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = `<button data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''} aria-label="${jrT('common.previous')}">${jrIcon('chevronLeft', 16)}</button>`;
  for (let p = 1; p <= totalPages; p++) {
    if (totalPages > 7 && Math.abs(p - currentPage) > 2 && p !== 1 && p !== totalPages) {
      if (p === 2 || p === totalPages - 1) html += `<span style="color:var(--color-text-dim)">…</span>`;
      continue;
    }
    html += `<button data-page="${p}" class="${p === currentPage ? 'active' : ''}">${p}</button>`;
  }
  html += `<button data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''} aria-label="${jrT('common.next')}">${jrIcon('chevronRight', 16)}</button>`;

  container.innerHTML = html;
  container.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = Number(btn.getAttribute('data-page'));
      if (p >= 1 && p <= totalPages) onPage(p);
    });
  });
}

/* ---------- Modal ---------- */
function jrOpenModal(overlayEl) {
  overlayEl.classList.add('open');
  overlayEl.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const closeBtn = overlayEl.querySelector('.modal-close');
  if (closeBtn) closeBtn.focus();
}
function jrCloseModal(overlayEl) {
  overlayEl.classList.remove('open');
  overlayEl.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) jrCloseModal(overlay); });
    const closeBtn = overlay.querySelector('.modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => jrCloseModal(overlay));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(jrCloseModal);
    }
  });
});
