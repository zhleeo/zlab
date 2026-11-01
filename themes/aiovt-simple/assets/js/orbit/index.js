import { groupPostsByYear, orbitPosition } from './data.js';
import { createPlanetElement, setPlanetPosition, updatePlanetElement } from './planet.js';
import {
  applyEllipseTransform,
  applyOrbitOpacity,
  applyOrbitStroke,
  createOrbitEllipse,
  createOrbitSlot,
  getPlanetAngle,
  MAX_VISIBLE_RINGS,
  setOrbitRingRadii,
  syncAllRingGradients,
} from './orbit.js';
import { OrbitAnimation, observeSection } from './animation.js';
import { OrbitScrollStory } from './scroll-story.js';

export class OrbitSystem {
  /**
   * @param {HTMLElement} root
   * @param {import('./data.js').Post[]} posts
   */
  constructor(root, posts) {
    this.root = root;
    this.posts = posts;
    this.fitWrap = document.getElementById('orbit-fit');
    this.stage = document.getElementById('orbit-stage');
    this.svg = document.getElementById('orbit-svg');
    this.labels = document.getElementById('orbit-labels');
    this.planetsContainer = document.getElementById('orbit-planets');
    this.section = document.getElementById('orbit-section');
    /** @type {import('./data.js').OrbitData[]} */
    this.orbits = [];
    /** @type {OrbitAnimation|null} */
    this.animation = null;

    this.orbitSpacing = 28;
    this.baseRx = 70;
    this.baseRy = 32;
    this.padding = 80;
    this.verticalPad = 0;
    this.centerYOffset = 0;
    this.stageH = 0;
    this.viewportW = 0;
    this.viewportH = 0;
    this.cx = 0;
    this.cy = 0;
    this.colorIndex = 0;
    this.nextSpawnYearIdx = { value: 0 };
    /** @type {import('./data.js').YearGroup[]|null} */
    this.yearGroups = null;
    /** @type {OrbitScrollStory|null} */
    this.scrollStory = null;
    this.resizeTimer = 0;
  }

  init() {
    if (!this.stage || !this.fitWrap || !this.svg || !this.labels || !this.planetsContainer || !this.section) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const yearGroups = groupPostsByYear(this.posts);

    if (!yearGroups.length) {
      this.showEmpty();
      return;
    }

    this.yearGroups = yearGroups;
    this.computeLayoutForViewport();

    this.setupStage();
    this.buildDOM();
    this.applyViewportLayout();
    this.positionSun();
    this.renderStaticPositions();
    this.root.classList.add('orbit-system--visible');

    if (!reducedMotion) {
      this.animation = new OrbitAnimation({
        orbits: this.orbits,
        allYearGroups: this.yearGroups,
        systemEl: this.root,
        layout: {
          baseRx: this.baseRx,
          baseRy: this.baseRy,
          orbitSpacing: this.orbitSpacing,
          cx: this.cx,
          cy: this.cy,
        },
        nextSpawnYearIdx: this.nextSpawnYearIdx,
        onSpawnRing: (group, slot) => this.spawnRing(group, slot),
        onRemoveRing: (orbit) => this.removeRing(orbit),
      });
      observeSection(this.section, this.animation);
      this.bindOrbitHover();
    } else {
      this.root.classList.add('orbit-system--visible');
      this.renderStaticPositions();
    }

    window.addEventListener('resize', () => this.scheduleResize());

    if (!reducedMotion && yearGroups.length > 0) {
      this.scrollStory = new OrbitScrollStory(this);
      this.scrollStory.init();
    }

    this.bindThemeRefresh();
  }

  bindThemeRefresh() {
    const refresh = () => {
      if (this.svg && this.orbits.length) {
        syncAllRingGradients(this.svg, this.orbits, {
          focusedYear: this.animation?.focusedYear ?? null,
        });
      }
      this.scrollStory?.refreshStoryRingStroke();
    };

    new MutationObserver(refresh).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  setupStage() {
    this.applyStageMetrics();
  }

  /**
   * @param {import('./data.js').YearGroup} group
   * @param {number} slot
   */
  spawnRing(group, slot) {
    const orbit = createOrbitSlot(
      group,
      group.year,
      this.cx,
      this.cy,
      this.orbitSpacing,
      this.baseRx,
      this.baseRy
    );
    orbit.slot = slot;

    createOrbitEllipse(this.svg, orbit, { behind: slot === 0 });
    this.mountPlanetsForOrbit(orbit);
    this.orbits.push(orbit);
    return orbit;
  }

  /**
   * @param {import('./data.js').OrbitData} orbit
   */
  removeRing(orbit) {
    orbit.ellipseEl?.remove();
    for (const el of orbit.planetEls) el.remove();
    const idx = this.orbits.indexOf(orbit);
    if (idx >= 0) this.orbits.splice(idx, 1);
  }

  buildDOM() {
    this.svg.innerHTML = '';
    this.labels.innerHTML = '';
    this.planetsContainer.innerHTML = '';
    this.orbits = [];
    this.colorIndex = 0;

    if (!this.yearGroups?.length) return;

    const count = Math.min(MAX_VISIBLE_RINGS, this.yearGroups.length);
    for (let i = 0; i < count; i++) {
      this.spawnRing(this.yearGroups[i], i);
    }
    this.nextSpawnYearIdx.value = count;
  }

  /** Size orbits for the fixed visible ring count */
  computeLayoutForViewport() {
    this.viewportW = window.innerWidth;
    this.viewportH = window.innerHeight;
    this.centerYOffset = 0;
    this.verticalPad = 0;
    this.stageH = this.viewportH;
    this.padding = Math.round(Math.min(this.viewportW, this.viewportH) * 0.025);
    this.baseRx = this.viewportW * 0.06;
    this.baseRy = this.viewportH * 0.034;

    const ringCount = Math.min(MAX_VISIBLE_RINGS, this.yearGroups?.length ?? MAX_VISIBLE_RINGS);
    if (ringCount <= 1) {
      this.orbitSpacing = 0;
      return;
    }

    const outerSlot = ringCount - 1;
    const outerRxTarget = this.viewportW * 0.5 - this.padding;
    const spacingByWidth = (outerRxTarget - this.baseRx) / outerSlot;

    const cy = this.viewportH / 2 + this.centerYOffset;
    const verticalBudget = Math.min(
      cy - this.padding,
      this.stageH - cy - this.padding
    );
    const spacingByHeight = (verticalBudget - this.baseRx) / outerSlot;

    this.orbitSpacing = Math.max(10, spacingByWidth);
    if (this.baseRx + outerSlot * this.orbitSpacing > verticalBudget) {
      this.orbitSpacing = Math.max(10, spacingByHeight);
    }
  }

  applyStageMetrics() {
    const width = this.viewportW;
    const viewHeight = this.viewportH;
    const stageHeight = this.stageH;

    this.cx = width / 2;
    this.cy = Math.round(viewHeight / 2 + this.centerYOffset);

    this.stage.style.width = `${width}px`;
    this.stage.style.height = `${stageHeight}px`;
    this.stage.style.top = '0';
    this.stage.style.left = '0';
    this.stage.style.transform = 'none';

    this.svg.setAttribute('width', String(width));
    this.svg.setAttribute('height', String(stageHeight));
    this.svg.setAttribute('viewBox', `0 0 ${width} ${stageHeight}`);
    this.svg.setAttribute('overflow', 'visible');

    this.labels.style.width = `${width}px`;
    this.labels.style.height = `${stageHeight}px`;

    this.fitWrap.style.width = `${width}px`;
    this.fitWrap.style.height = `${viewHeight}px`;
  }

  /**
   * @param {HTMLAnchorElement} el
   */
  bindPlanetHover(el) {
    if (el.dataset.hoverBound) return;
    el.dataset.hoverBound = '1';

    el.addEventListener('mouseenter', () => {
      el.classList.add('is-hovered');
      this.animation?.setFocusedYear(Number(el.dataset.year));
      this.animation?.setPaused(true);
    });
    el.addEventListener('mouseleave', () => {
      el.classList.remove('is-hovered');
      this.animation?.setFocusedYear(null);
      this.animation?.setPaused(false);
    });
  }

  /**
   * @param {import('./data.js').OrbitData} orbit
   * @param {import('./data.js').YearGroup} group
   */
  syncOrbitPlanets(orbit, group) {
    const posts = group.posts;

    while (orbit.planetEls.length > posts.length) {
      orbit.planetEls.pop()?.remove();
    }

    posts.forEach((post, i) => {
      const existing = orbit.planetEls[i];
      if (existing) {
        updatePlanetElement(existing, post);
      } else {
        const el = createPlanetElement(post, this.colorIndex++);
        this.planetsContainer.appendChild(el);
        this.bindPlanetHover(el);
        orbit.planetEls.push(el);
      }
    });
  }

  /**
   * @param {import('./data.js').OrbitData} orbit
   */
  mountPlanetsForOrbit(orbit) {
    orbit.planetEls = [];
    this.syncOrbitPlanets(orbit, { year: orbit.year, posts: orbit.posts });
  }

  bindOrbitHover() {
    for (const orbit of this.orbits) {
      orbit.ellipseEl?.addEventListener('mouseenter', () => {
        this.animation?.setFocusedYear(orbit.year);
      });
    }

    this.stage?.addEventListener('mouseleave', () => {
      this.animation?.setFocusedYear(null);
    });
  }

  positionSun() {
    if (!this.orbits.length) return;
    const sun = document.getElementById('orbit-sun');
    if (sun) {
      sun.style.transform = `translate3d(${this.cx}px, ${this.cy}px, 0)`;
    }
  }

  renderStaticPositions() {
    for (const orbit of this.orbits) {
      orbit.posts.forEach((_, i) => {
        const angle = getPlanetAngle(orbit, i);
        const pos = orbitPosition(orbit.cx, orbit.cy, orbit.rx, orbit.ry, angle, orbit.tilt);
        setPlanetPosition(orbit.planetEls[i], pos.x, pos.y);
      });
    }
  }

  scheduleResize() {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => this.applyViewportLayout(), 120);
  }

  applyViewportLayout() {
    if (!this.stage || !this.fitWrap || !this.yearGroups?.length) return;

    this.computeLayoutForViewport();
    this.applyStageMetrics();

    for (const orbit of this.orbits) {
      orbit.cx = this.cx;
      orbit.cy = this.cy;
      if (orbit.ellipseEl) {
        orbit.ellipseEl.setAttribute('cx', String(this.cx));
        orbit.ellipseEl.setAttribute('cy', String(this.cy));
      }
    }

    if (this.animation) {
      this.animation.layout = {
        baseRx: this.baseRx,
        baseRy: this.baseRy,
        orbitSpacing: this.orbitSpacing,
        cx: this.cx,
        cy: this.cy,
      };
      this.animation.applyCarouselLayout();
    } else {
      for (const orbit of this.orbits) {
        setOrbitRingRadii(
          orbit,
          orbit.slot ?? orbit.index,
          this.baseRx,
          this.baseRy,
          this.orbitSpacing
        );
        applyOrbitOpacity(orbit, 1);
        if (orbit.ellipseEl) {
          applyOrbitStroke(orbit);
          applyEllipseTransform(orbit);
        }
      }
      if (this.svg && this.orbits.length) {
        syncAllRingGradients(this.svg, this.orbits);
      }
      this.renderStaticPositions();
    }

    this.positionSun();
  }

  showEmpty() {
    const empty = document.createElement('p');
    empty.className = 'orbit-section__empty';
    empty.textContent = '暂无文章，轨道等待点亮…';
    this.root.appendChild(empty);
    this.root.classList.add('orbit-system--visible');
  }
}

function normalizePosts(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'string') return JSON.parse(parsed);
  }
  return [];
}

function isMobileTimeline() {
  return window.matchMedia('(max-width: 767px)').matches;
}

function bootstrap() {
  const systemEl = document.getElementById('orbit-system');
  if (!systemEl || isMobileTimeline()) return;

  try {
    const posts = normalizePosts(window.__ORBIT_POSTS__);
    const system = new OrbitSystem(systemEl, posts);
    systemEl.classList.add('orbit-system--entering');
    system.init();
    requestAnimationFrame(() => {
      systemEl.classList.remove('orbit-system--entering');
      systemEl.classList.add('orbit-system--visible');
    });
  } catch (err) {
    console.error('[orbit-system]', err);
    systemEl.classList.add('orbit-system--visible');
    const msg = document.createElement('p');
    msg.className = 'orbit-section__empty';
    msg.textContent = '文章星系加载失败，请刷新页面重试。';
    systemEl.appendChild(msg);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
