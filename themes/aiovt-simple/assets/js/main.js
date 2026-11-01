(() => {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const RAIN_DESKTOP_MQ = window.matchMedia('(min-width: 768px)');

  /* ── Rain (desktop home only) ── */
  function initRain() {
    const canvas = document.getElementById('rain-canvas');
    if (!canvas || prefersReducedMotion) return;
    if (
      !document.body.classList.contains('is-home') &&
      !document.body.classList.contains('is-thoughts') &&
      !document.body.classList.contains('is-friends') &&
      !document.body.classList.contains('is-guestbook') &&
      !document.body.classList.contains('is-posts-list') &&
      !document.body.classList.contains('is-tag-term') &&
      !document.body.classList.contains('is-tags-index') &&
      !document.body.classList.contains('is-category-term') &&
      !document.body.classList.contains('is-categories-index')
    ) {
      return;
    }

    if (
      document.body.classList.contains('is-home') &&
      canvas.parentElement &&
      canvas.parentElement !== document.body
    ) {
      document.body.appendChild(canvas);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let drops = [];
    let rafId = 0;
    let running = false;

    function createDrop(randomY) {
      const length = 16 + Math.random() * 20;
      const angleDeg = 8;
      const slant = Math.tan((angleDeg * Math.PI) / 180);
      return {
        x: Math.random() * width,
        y: randomY ? Math.random() * height : -28,
        length,
        drift: length * slant,
        speed: 1.2 + Math.random() * 2,
        opacity: 0.2 + Math.random() * 0.22,
      };
    }

    function stopRain() {
      running = false;
      cancelAnimationFrame(rafId);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.style.display = 'none';
      drops = [];
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      const count = Math.min(72, Math.max(36, Math.floor((width * height) / 22000)));
      drops = Array.from({ length: count }, () => createDrop(true));
    }

    function draw() {
      if (!running) return;

      ctx.clearRect(0, 0, width, height);
      for (const d of drops) {
        const vx = -d.drift;
        const vy = d.length;
        const mag = Math.hypot(vx, vy) || 1;
        const nx = vx / mag;
        const ny = vy / mag;

        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + nx * d.length, d.y + ny * d.length);
        ctx.strokeStyle = `rgba(120, 138, 158, ${d.opacity})`;
        ctx.lineWidth = 0.9;
        ctx.lineCap = 'round';
        ctx.stroke();

        d.x += nx * d.speed;
        d.y += ny * d.speed;
        if (d.y > height + d.length || d.x < -d.length) {
          Object.assign(d, createDrop(false), { y: -d.length, x: Math.random() * width });
        }
      }
      rafId = requestAnimationFrame(draw);
    }

    function startRain() {
      canvas.style.display = 'block';
      running = true;
      resize();
      cancelAnimationFrame(rafId);
      draw();
    }

    function syncRain() {
      if (!RAIN_DESKTOP_MQ.matches) {
        stopRain();
        return;
      }
      startRain();
    }

    syncRain();
    window.addEventListener('resize', syncRain, { passive: true });
    RAIN_DESKTOP_MQ.addEventListener('change', syncRain);

    document.addEventListener('visibilitychange', () => {
      if (!RAIN_DESKTOP_MQ.matches) return;
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(rafId);
      } else {
        startRain();
      }
    });
  }

  /* ── Water Ripples ── */
  function initRipples() {
    const container = document.getElementById('ripple-container');
    if (!container || prefersReducedMotion) return;

    function spawnRipple() {
      const el = document.createElement('div');
      el.className = 'hero-bg__ripple';
      const size = 40 + Math.random() * 80;
      el.style.width = `${size}px`;
      el.style.height = `${size * 0.35}px`;
      el.style.left = `${10 + Math.random() * 80}%`;
      el.style.bottom = `${Math.random() * 20}%`;
      container.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    }

    function schedule() {
      spawnRipple();
      setTimeout(schedule, 2000 + Math.random() * 4000);
    }

    schedule();
  }

  /* ── Bokeh ── */
  function initBokeh() {
    const container = document.getElementById('bokeh-container');
    if (!container || prefersReducedMotion) return;

    const colors = [
      'rgba(180, 170, 255, 0.25)',
      'rgba(255, 180, 200, 0.2)',
      'rgba(255, 230, 160, 0.2)',
    ];

    function spawn() {
      const el = document.createElement('div');
      el.className = 'hero-bg__bokeh-dot';
      const size = 60 + Math.random() * 100;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.left = `${Math.random() * 100}%`;
      el.style.top = `${Math.random() * 100}%`;
      el.style.background = colors[Math.floor(Math.random() * colors.length)];
      el.style.setProperty('--dx', `${(Math.random() - 0.5) * 60}px`);
      el.style.setProperty('--dy', `${(Math.random() - 0.5) * 60}px`);
      container.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    }

    function schedule() {
      spawn();
      setTimeout(schedule, 4000 + Math.random() * 6000);
    }

    schedule();
  }

  /* ── Hitokoto (一言) ── */
  function initHitokoto() {
    const el = document.querySelector('[data-hitokoto]');
    if (!el) return;

    const textEl = el.querySelector('[data-hitokoto-text]');
    const fromEl = el.querySelector('[data-hitokoto-from]');
    const fallback = el.dataset.fallback || '一言加载失败，点击重试';
    const showFrom = el.hasAttribute('data-show-from');
    const type = el.dataset.type;
    const intervalSec = Number(el.dataset.interval);
    const rotateMs = Number.isFinite(intervalSec) && intervalSec > 0 ? intervalSec * 1000 : 30000;
    const seenMax = Number(el.dataset.seenMax);
    const SEEN_MAX = Number.isFinite(seenMax) && seenMax > 0 ? seenMax : 100;
    const SEEN_KEY = 'hitokoto-seen-ids';
    let fetching = false;
    let rotateTimer = 0;

    function formatQuote(text) {
      const trimmed = text.trim();
      if (/^[「『"“]/.test(trimmed)) return trimmed;
      return `「${trimmed}」`;
    }

    function formatFrom(from, fromWho) {
      if (!from) return '';
      return fromWho ? `—— ${fromWho} · ${from}` : `—— ${from}`;
    }

    function loadSeenIds() {
      try {
        const raw = sessionStorage.getItem(SEEN_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    function saveSeenIds(ids) {
      try {
        sessionStorage.setItem(SEEN_KEY, JSON.stringify(ids));
      } catch {
        /* private mode / quota */
      }
    }

    function clearSeenIds() {
      try {
        sessionStorage.removeItem(SEEN_KEY);
      } catch {
        /* ignore */
      }
    }

    function quoteKey(data) {
      return String(data.id ?? data.uuid ?? data.hitokoto);
    }

    function isSeen(key) {
      return loadSeenIds().includes(key);
    }

    function rememberQuote(data) {
      const key = quoteKey(data);
      let ids = loadSeenIds();
      if (ids.includes(key)) return;
      ids.push(key);
      if (ids.length > SEEN_MAX) {
        clearSeenIds();
        ids = [key];
      }
      saveSeenIds(ids);
    }

    async function requestHitokoto() {
      const params = new URLSearchParams({
        encode: 'json',
        t: String(Date.now()),
      });
      if (type) params.set('c', type);
      const res = await fetch(`https://v1.hitokoto.cn/?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || data.status) throw new Error('fetch failed');
      return data;
    }

    async function pickHitokoto() {
      const maxRetries = 8;

      for (let attempt = 0; attempt < maxRetries; attempt += 1) {
        const data = await requestHitokoto();
        const key = quoteKey(data);
        if (!isSeen(key)) {
          rememberQuote(data);
          return data;
        }
      }

      clearSeenIds();
      const data = await requestHitokoto();
      rememberQuote(data);
      return data;
    }

    async function renderHitokoto(data) {
      textEl.style.opacity = '0';
      if (fromEl) fromEl.style.opacity = '0';
      await new Promise((r) => setTimeout(r, 180));

      textEl.textContent = formatQuote(data.hitokoto);
      textEl.style.opacity = '';

      if (showFrom && fromEl) {
        const fromText = formatFrom(data.from, data.from_who);
        if (fromText) {
          fromEl.textContent = fromText;
          fromEl.hidden = false;
          fromEl.style.opacity = '';
        } else {
          fromEl.hidden = true;
        }
      }
    }

    async function fetchHitokoto() {
      if (fetching) return;
      fetching = true;
      textEl.classList.add('is-loading');

      try {
        const data = await pickHitokoto();
        await renderHitokoto(data);
      } catch {
        textEl.textContent = fallback;
        textEl.style.opacity = '';
        if (fromEl) fromEl.hidden = true;
      } finally {
        textEl.classList.remove('is-loading');
        fetching = false;
      }
    }

    function startRotateTimer() {
      window.clearInterval(rotateTimer);
      rotateTimer = window.setInterval(() => {
        if (document.hidden || fetching) return;
        fetchHitokoto();
      }, rotateMs);
    }

    function stopRotateTimer() {
      window.clearInterval(rotateTimer);
      rotateTimer = 0;
    }

    el.addEventListener('click', fetchHitokoto);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fetchHitokoto();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopRotateTimer();
      else startRotateTimer();
    });

    fetchHitokoto().finally(startRotateTimer);
  }

  /* ── Theme Toggle ── */
  const THEME_KEY = 'theme';
  let themeTransitioning = false;
  let themeAnimationTimer = 0;

  function getPreferredTheme() {
    return 'light';
  }

  function getStoredTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  }

  function supportsViewThemeTransition() {
    return !prefersReducedMotion && typeof document.startViewTransition === 'function';
  }

  function getTransitionOrigin(trigger) {
    const rect = trigger.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function getTransitionRadius(x, y) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return (
      Math.max(
        Math.hypot(x, y),
        Math.hypot(w - x, y),
        Math.hypot(x, h - y),
        Math.hypot(w - x, h - y)
      ) + 16
    );
  }

  function beginThemeFallbackAnimation() {
    window.clearTimeout(themeAnimationTimer);
    document.documentElement.classList.add('is-theme-animating');
  }

  function endThemeFallbackAnimation() {
    window.clearTimeout(themeAnimationTimer);
    themeAnimationTimer = window.setTimeout(() => {
      document.documentElement.classList.remove('is-theme-animating');
    }, 480);
  }

  function clearThemeMotion(root) {
    root.removeAttribute('data-theme-motion');
    root.style.removeProperty('--theme-x');
    root.style.removeProperty('--theme-y');
    root.style.removeProperty('--theme-r');
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark-mode', theme === 'dark');

    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      const isDark = theme === 'dark';
      btn.setAttribute('aria-label', isDark ? '切换为浅色模式' : '切换为深色模式');
      if (btn.classList.contains('header-mobile__theme')) {
        btn.textContent = isDark ? '浅色模式' : '深色模式';
      }
    });
  }

  async function setTheme(next, trigger) {
    if (themeTransitioning) return;

    const current = document.documentElement.getAttribute('data-theme') || 'light';
    if (next === current) return;

    localStorage.setItem(THEME_KEY, next);

    const canReveal = supportsViewThemeTransition()
      && trigger
      && typeof trigger.getBoundingClientRect === 'function';

    if (!canReveal) {
      beginThemeFallbackAnimation();
      applyTheme(next);
      endThemeFallbackAnimation();
      return;
    }

    themeTransitioning = true;
    const root = document.documentElement;
    const { x, y } = getTransitionOrigin(trigger);
    const radius = getTransitionRadius(x, y);

    root.style.setProperty('--theme-x', `${x}px`);
    root.style.setProperty('--theme-y', `${y}px`);
    root.style.setProperty('--theme-r', `${radius}px`);
    root.setAttribute('data-theme-motion', next === 'dark' ? 'expand' : 'contract');

    try {
      const transition = document.startViewTransition(() => {
        applyTheme(next);
      });
      await transition.finished;
    } catch {
      applyTheme(next);
    } finally {
      clearThemeMotion(root);
      themeTransitioning = false;
    }
  }

  function initThemeToggle() {
    const stored = getStoredTheme();
    applyTheme(stored || getPreferredTheme());

    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        setTheme(next, event.currentTarget);
      });
    });
  }

  /* ── Mobile nav drawer ── */
  function initMobileNav() {
    const toggle = document.querySelector('.header-mobile__toggle');
    const drawer = document.getElementById('header-mobile-drawer');
    if (!toggle || !drawer) return;

    const links = drawer.querySelectorAll('.header-mobile__link');

    function isOpen() {
      return toggle.getAttribute('aria-expanded') === 'true';
    }

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
      drawer.hidden = !open;
    }

    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      setOpen(!isOpen());
    });

    links.forEach((link) => {
      link.addEventListener('click', () => setOpen(false));
    });

    document.addEventListener('click', (event) => {
      if (!isOpen()) return;
      if (drawer.contains(event.target) || toggle.contains(event.target)) return;
      setOpen(false);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  /* ── Site uptime ── */
  function initSiteUptime() {
    const el = document.getElementById('site-uptime');
    if (!el) return;

    const start = Number(el.dataset.start);
    if (!Number.isFinite(start)) return;

    const daysEl = el.querySelector('[data-uptime-days]');
    const hoursEl = el.querySelector('[data-uptime-hours]');
    const minutesEl = el.querySelector('[data-uptime-minutes]');
    const secondsEl = el.querySelector('[data-uptime-seconds]');
    if (!daysEl || !hoursEl || !minutesEl || !secondsEl) return;

    function tick() {
      const totalSec = Math.max(0, Math.floor((Date.now() - start) / 1000));
      daysEl.textContent = String(Math.floor(totalSec / 86400));
      hoursEl.textContent = String(Math.floor((totalSec % 86400) / 3600));
      minutesEl.textContent = String(Math.floor((totalSec % 3600) / 60));
      secondsEl.textContent = String(totalSec % 60);
    }

    tick();
    window.setInterval(tick, 1000);
  }

  /* ── Scroll reveal & page entry ── */
  function whenSiteReady(fn) {
    if (
      document.documentElement.classList.contains('is-site-ready') ||
      (!document.getElementById('site-loader') &&
        !document.documentElement.classList.contains('is-site-loading'))
    ) {
      if (!document.documentElement.classList.contains('is-site-ready')) {
        document.documentElement.classList.add('is-site-ready');
      }
      fn();
      return;
    }

    document.addEventListener('site-loader:finished', fn, { once: true });
  }

  function isNearViewport(el) {
    const rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight * 0.92 && rect.bottom > 0;
  }

  function initMotion() {
    const skipRoot =
      '.friends-page, .archives-page, .thoughts-page, .post, .orbit-system, .hero-bg, [data-orbit-story]';

    function shouldSkip(el) {
      return Boolean(el.closest(skipRoot));
    }

    document.querySelectorAll('[data-posts-list] [data-posts-item]').forEach((el, i) => {
      el.style.setProperty('--motion-i', String(i % 16));
    });

    document.querySelectorAll('[data-tag-term] .tag-term-item').forEach((el, i) => {
      el.style.setProperty('--motion-i', String(i % 16));
    });

    document.querySelectorAll('[data-tag-term] .tag-term-year').forEach((el, i) => {
      el.style.setProperty('--motion-i', String(i % 8));
    });

    document.querySelectorAll('[data-tags-index] .tags-index-cloud__item').forEach((el, i) => {
      el.style.setProperty('--motion-i', String(i % 20));
    });

    document.querySelectorAll('.about-page:not(.is-visible)').forEach((page) => {
      if (prefersReducedMotion) {
        page.classList.add('is-visible');
        return;
      }
      requestAnimationFrame(() => page.classList.add('is-visible'));
    });

    if (prefersReducedMotion) {
      document.querySelectorAll('.motion-reveal').forEach((el) => el.classList.add('is-inview'));
      return;
    }

    const revealSelectors = [
      '.home-musings',
      '.home-musings__item',
      '.home-closing',
      '.home-closing__head',
      '.home-closing__panel',
      '.posts-timeline__header',
      '.posts-timeline__year',
      '.posts-timeline__item',
      '.season-archive__block',
      '.site-footer',
      '.friends-group__head',
    ];

    const seen = new WeakSet();
    let itemIndex = 0;

    revealSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (seen.has(el) || shouldSkip(el)) return;
        seen.add(el);

        if (
          document.body.classList.contains('is-home') &&
          el.closest('#posts-view, .posts-timeline, .home-closing, .posts-view__season')
        ) {
          return;
        }

        el.classList.add('motion-reveal');
        if (selector.includes('__item') || selector.includes('__panel') || selector.includes('__block')) {
          el.style.setProperty('--motion-i', String(itemIndex % 12));
          itemIndex += 1;
        }
      });
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-inview');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px 12% 0px', threshold: 0.01 }
    );

    document.querySelectorAll('.motion-reveal:not(.is-inview)').forEach((el) => {
      if (isNearViewport(el)) {
        el.classList.add('is-inview');
        return;
      }
      observer.observe(el);
    });
  }

  function runWhenIdle(fn, timeout) {
    const wait = timeout || 2500;
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => fn(), { timeout: wait });
    } else {
      window.setTimeout(fn, 400);
    }
  }

  function bootDecorEffects() {
    initRain();
    initRipples();
    initBokeh();
  }

  function initHomeScrollPerf() {
    if (!document.body.classList.contains('is-home')) return;
    if (!window.matchMedia('(max-width: 767px)').matches) return;

    var scrollEndTimer = 0;

    window.addEventListener(
      'scroll',
      function () {
        document.documentElement.classList.add('is-scrolling');
        window.clearTimeout(scrollEndTimer);
        scrollEndTimer = window.setTimeout(function () {
          document.documentElement.classList.remove('is-scrolling');
        }, 180);
      },
      { passive: true }
    );
  }

  function boot() {
    initThemeToggle();
    initMobileNav();
    initSiteUptime();
    initHomeScrollPerf();

    whenSiteReady(() => {
      initMotion();
      initHitokoto();

      const startDecor = () => runWhenIdle(bootDecorEffects, 1200);

      if (document.readyState === 'complete') {
        startDecor();
      } else {
        window.addEventListener('load', startDecor, { once: true });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
