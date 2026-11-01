(function () {
  'use strict';

  var SESSION_SEEN_KEY = 'site-loader-seen';

  function markSessionSeen() {
    try {
      sessionStorage.setItem(SESSION_SEEN_KEY, '1');
    } catch (e) {
      /* private mode */
    }
  }

  function markSkipOnNextLoad() {
    markSessionSeen();
  }

  function consumeSkipFlag() {
    if (document.documentElement.dataset.loaderSkip === '1') {
      delete document.documentElement.dataset.loaderSkip;
      return true;
    }

    try {
      if (sessionStorage.getItem(SESSION_SEEN_KEY) === '1') {
        return true;
      }
    } catch (e) {
      /* private mode */
    }

    return false;
  }

  var loader = document.getElementById('site-loader');
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finishScheduled = false;
  var pageStartedAt = performance.now();
  var orbitRafId = 0;

  function isInternalNavLink(link) {
    if (!link || link.tagName !== 'A') return false;

    var href = link.getAttribute('href');
    if (!href || href.charAt(0) === '#') return false;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return false;
    if (link.target === '_blank' || link.hasAttribute('download')) return false;

    try {
      var url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return false;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash
      ) {
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function bindInternalNavSkip() {
    document.addEventListener('click', function (event) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }

      var link = event.target.closest('a');
      if (!isInternalNavLink(link)) return;

      window.setTimeout(function () {
        if (event.defaultPrevented) return;
        markSkipOnNextLoad();
      }, 0);
    });
  }

  function markSiteReady() {
    if (document.documentElement.classList.contains('is-site-ready')) return;

    document.documentElement.classList.remove('is-site-loading');
    document.body.classList.remove('is-site-loading');
    document.documentElement.classList.add('is-site-ready');
    document.dispatchEvent(new CustomEvent('site-loader:finished'));
  }

  function initLazyMedia() {
    var skipRoot = '.site-loader, .header-logo, #hero, .post-head';

    function shouldSkip(el) {
      return Boolean(el.closest(skipRoot));
    }

    document.querySelectorAll('img:not([loading])').forEach(function (img) {
      if (shouldSkip(img)) return;
      img.loading = 'lazy';
      img.decoding = 'async';
    });

    document.querySelectorAll('iframe:not([loading])').forEach(function (frame) {
      if (shouldSkip(frame)) return;
      frame.loading = 'lazy';
    });

    document.querySelectorAll('img[data-src]').forEach(function (img) {
      if (shouldSkip(img) || img.dataset.lazyBound === '1') return;
      img.dataset.lazyBound = '1';
      img.classList.add('is-lazy-pending');

      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            var target = entry.target;
            var src = target.getAttribute('data-src');
            if (src) target.src = src;
            observer.unobserve(target);
          });
        },
        { rootMargin: '180px 0px', threshold: 0.01 }
      );

      observer.observe(img);
    });

    document.querySelectorAll('img[loading="lazy"], img[data-src], iframe[loading="lazy"]').forEach(
      function (el) {
        if (shouldSkip(el)) return;

        function markLoaded() {
          el.classList.add('is-lazy-loaded');
          el.classList.remove('is-lazy-pending');
        }

        if (el.tagName === 'IMG' && el.complete && el.naturalWidth > 0) {
          markLoaded();
          return;
        }

        if (!el.classList.contains('is-lazy-pending')) {
          el.classList.add('is-lazy-pending');
        }

        el.addEventListener('load', markLoaded, { once: true });
        el.addEventListener('error', markLoaded, { once: true });
      }
    );
  }

  function stopOrbit() {
    if (orbitRafId) {
      cancelAnimationFrame(orbitRafId);
      orbitRafId = 0;
    }
  }

  function startOrbit() {
    if (!loader || prefersReducedMotion) return;

    var planets = loader.querySelectorAll('.site-loader__planet[data-orbit-rx]');
    if (!planets.length) return;

    var orbitStart = performance.now();

    function tick(now) {
      if (!loader || loader.dataset.done === '1') {
        stopOrbit();
        return;
      }

      planets.forEach(function (group) {
        var cx = Number(group.dataset.orbitCx) || 140;
        var cy = Number(group.dataset.orbitCy) || 140;
        var rx = Number(group.dataset.orbitRx) || 108;
        var ry = Number(group.dataset.orbitRy) || 68;
        var duration = Number(group.dataset.orbitDuration) || 2400;
        var phase = Number(group.dataset.orbitPhase) || 0;
        var halo = group.querySelector('.site-loader__planet-halo');
        var core = group.querySelector('.site-loader__planet-core');
        if (!halo || !core) return;

        var angle = phase + ((now - orbitStart) % duration) / duration * Math.PI * 2;
        var x = cx + rx * Math.cos(angle);
        var y = cy + ry * Math.sin(angle);

        group.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
      });

      orbitRafId = requestAnimationFrame(tick);
    }

    stopOrbit();
    orbitRafId = requestAnimationFrame(tick);
  }

  function finishLoader() {
    stopOrbit();

    if (!loader) {
      markSiteReady();
      return;
    }

    if (loader.dataset.done === '1') return;
    loader.dataset.done = '1';
    markSessionSeen();
    markSiteReady();

    loader.classList.add('is-leaving');

    var removed = false;
    function removeLoader() {
      if (removed) return;
      removed = true;
      if (loader.parentNode) loader.parentNode.removeChild(loader);
      loader = null;
    }

    loader.addEventListener('transitionend', removeLoader, { once: true });
    window.setTimeout(removeLoader, 700);
  }

  function scheduleFinish() {
    if (finishScheduled || !loader) return;
    finishScheduled = true;

    var minDuration = Number(loader.dataset.minDuration) || 900;
    var elapsed = performance.now() - pageStartedAt;
    var wait = Math.max(0, minDuration - elapsed);

    window.setTimeout(finishLoader, wait);
  }

  function skipLoader() {
    stopOrbit();

    if (loader) {
      loader.dataset.done = '1';
      if (loader.parentNode) loader.parentNode.removeChild(loader);
      loader = null;
    }

    markSiteReady();
  }

  function initLoader() {
    if (consumeSkipFlag()) {
      skipLoader();
      return;
    }

    if (!loader) {
      markSiteReady();
      return;
    }

    document.body.classList.add('is-site-loading');

    if (prefersReducedMotion) {
      finishLoader();
      return;
    }

    startOrbit();

    var maxDuration = Number(loader.dataset.maxDuration) || 6000;

    if (document.readyState === 'complete') {
      scheduleFinish();
    } else {
      window.addEventListener('load', scheduleFinish, { once: true });
    }

    window.setTimeout(scheduleFinish, maxDuration);
  }

  function scheduleLazyMedia() {
    function run() {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(initLazyMedia, { timeout: 1500 });
      } else {
        window.setTimeout(initLazyMedia, 300);
      }
    }

    if (document.documentElement.classList.contains('is-site-ready')) {
      run();
      return;
    }

    document.addEventListener('site-loader:finished', run, { once: true });
  }

  bindInternalNavSkip();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLoader);
    document.addEventListener('DOMContentLoaded', scheduleLazyMedia);
  } else {
    initLoader();
    scheduleLazyMedia();
  }
})();
