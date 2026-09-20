/* =========================================================
   main.js — site-wide bootstrap
   Handles: loading screen, mobile nav, active nav link,
   scroll-reveal animation, footer year, toast utility,
   scroll-to-top button, service worker registration.
   ========================================================= */

(function () {
  'use strict';

  /* ---------- Loading screen ---------- */
  window.addEventListener('load', function () {
    var loader = document.getElementById('app-loader');
    if (!loader) return;
    setTimeout(function () { loader.classList.add('hidden'); }, 350);
  });

  /* ---------- DOMContentLoaded init ---------- */
  document.addEventListener('DOMContentLoaded', function () {

    /* Mobile nav toggle */
    var toggle = document.querySelector('.nav-toggle');
    var links  = document.querySelector('.nav-links');
    if (toggle && links) {
      toggle.addEventListener('click', function () {
        var open = links.classList.toggle('open');
        toggle.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
      });
      links.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          links.classList.remove('open');
          toggle.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        });
      });
    }

    /* Active nav link */
    var current = (window.location.pathname.split('/').pop() || 'index.html');
    document.querySelectorAll('.nav-links a[href]').forEach(function (a) {
      var href = a.getAttribute('href').split('/').pop();
      if (href === current || (current === '' && href === 'index.html')) {
        a.classList.add('active');
      }
    });

    /* Footer year */
    document.querySelectorAll('[data-year]').forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });

    /* Scroll reveal */
    var revealTargets = document.querySelectorAll('.reveal, .reveal-stagger');
    if ('IntersectionObserver' in window && revealTargets.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.14 });
      revealTargets.forEach(function (el) { io.observe(el); });
    } else {
      revealTargets.forEach(function (el) { el.classList.add('in-view'); });
    }

    /* Scroll-to-top button */
    var scrollBtn = document.createElement('button');
    scrollBtn.className = 'scroll-top-btn';
    scrollBtn.setAttribute('aria-label', jrT('nav.scrollToTop'));
    scrollBtn.setAttribute('title', jrT('nav.scrollToTop'));
    scrollBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6"/></svg>';
    document.body.appendChild(scrollBtn);

    // Update scroll button on language change
    document.addEventListener('jr:langchange', function (e) {
      scrollBtn.setAttribute('aria-label', jrT('nav.scrollToTop', e.detail.lang));
      scrollBtn.setAttribute('title', jrT('nav.scrollToTop', e.detail.lang));
      // Update page title
      var lang = e.detail.lang;
      if (lang === 'hi') {
        document.title = 'जंगल राज – भारत की आवाज़ | राष्ट्रीय नागरिक डैशबोर्ड';
      } else {
        document.title = 'Jungle Raj — Voice of India | Citizen Awareness Platform';
      }
    });
    window.addEventListener('scroll', function () {
      scrollBtn.classList.toggle('visible', window.scrollY > 400);
    }, { passive: true });
    scrollBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

  }); /* end DOMContentLoaded */

  /* ---------- Toast utility (global) ---------- */
  window.jrToast = function (message, duration) {
    duration = duration || 2600;
    var toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
      toast.classList.remove('show');
    }, duration);
  };

  /* ---------- Service Worker (PWA) ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/service-worker.js').catch(function () {});
    });
  }

})();
