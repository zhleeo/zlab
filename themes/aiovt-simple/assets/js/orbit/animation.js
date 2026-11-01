import { orbitPosition } from './data.js';
import {
  applyOrbitOpacity,
  applyOrbitStroke,
  CAROUSEL_CYCLE_MS,
  getPlanetAngle,
  INNER_FADE_SLOT,
  MAX_VISIBLE_RINGS,
  OUTER_SLOT_LIMIT,
  setOrbitRingRadii,
  syncAllRingGradients,
  updateOrbitRotation,
  updateOrbitTilt,
} from './orbit.js';
import { setPlanetPosition } from './planet.js';

/**
 * @typedef {{
 *   orbits: import('./data.js').OrbitData[],
 *   allYearGroups: import('./data.js').YearGroup[],
 *   systemEl: HTMLElement,
 *   layout: { baseRx: number, baseRy: number, orbitSpacing: number, cx: number, cy: number },
 *   nextSpawnYearIdx: { value: number },
 *   onSpawnRing: (group: import('./data.js').YearGroup, slot: number) => import('./data.js').OrbitData,
 *   onRemoveRing: (orbit: import('./data.js').OrbitData) => void,
 * }} OrbitAnimationOptions
 */

export class OrbitAnimation {
  /**
   * @param {OrbitAnimationOptions} options
   */
  constructor(options) {
    this.orbits = options.orbits;
    this.allYearGroups = options.allYearGroups;
    this.systemEl = options.systemEl;
    this.layout = options.layout;
    this.nextSpawnYearIdx = options.nextSpawnYearIdx;
    this.onSpawnRing = options.onSpawnRing;
    this.onRemoveRing = options.onRemoveRing;

    this.running = false;
    this.rafId = 0;
    this.lastTime = 0;
    this.focusedYear = null;
    this.paused = false;
    this.visible = true;
    /** @type {number} shared 0–1 expansion phase for all rings */
    this.expandPhase = 0;
    this.carouselEnabled = this.allYearGroups.length > MAX_VISIBLE_RINGS;

    for (const orbit of this.orbits) {
      if (orbit.slot == null) orbit.slot = orbit.index ?? 0;
    }

    this.onVisibility = this.onVisibility.bind(this);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.tick(this.lastTime);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  onVisibility() {
    this.visible = !document.hidden;
    if (!this.visible) this.stop();
  }

  /**
   * @param {number|null} year
   */
  setFocusedYear(year) {
    this.focusedYear = year;
    this.applyFocusStyles();
  }

  setPaused(paused) {
    this.paused = paused;
  }

  applyFocusStyles() {
    const hasFocus = this.focusedYear !== null;

    for (const orbit of this.orbits) {
      const isFocused = orbit.year === this.focusedYear;
      const isDimmed = hasFocus && !isFocused;

      orbit.ellipseEl?.classList.toggle('is-focused', isFocused);
      orbit.ellipseEl?.classList.toggle('is-dimmed', isDimmed);
      applyOrbitStroke(orbit, isFocused);

      for (const el of orbit.planetEls) {
        el.classList.toggle('is-focused', isFocused);
        el.classList.toggle('is-dimmed', isDimmed);
      }
    }
  }

  /**
   * @param {import('./data.js').OrbitData} orbit
   */
  effectiveSlot(orbit) {
    return orbit.slot + (this.carouselEnabled ? this.expandPhase : 0);
  }

  /**
   * @param {number} t
   */
  smoothstep(t) {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  }

  /**
   * @param {import('./data.js').OrbitData} orbit
   */
  ringOpacity(orbit) {
    if (!this.carouselEnabled) return 1;

    const effective = this.effectiveSlot(orbit);
    let opacity = 1;

    if (orbit.fadingIn) {
      const fadeT = effective / INNER_FADE_SLOT;
      if (fadeT >= 1) {
        orbit.fadingIn = false;
      } else {
        opacity *= this.smoothstep(fadeT);
      }
    }

    const fadeStart = OUTER_SLOT_LIMIT - 0.28;
    if (effective > fadeStart) {
      opacity *= Math.max(0, 1 - (effective - fadeStart) / 0.28);
    }

    return opacity;
  }

  updateStrokeColors() {
    const svg = this.orbits[0]?.ellipseEl?.ownerSVGElement;
    if (svg) {
      syncAllRingGradients(svg, this.orbits, { focusedYear: this.focusedYear });
    }
  }

  applyCarouselLayout() {
    const { baseRx, baseRy, orbitSpacing } = this.layout;

    this.updateStrokeColors();

    for (const orbit of this.orbits) {
      setOrbitRingRadii(
        orbit,
        this.effectiveSlot(orbit),
        baseRx,
        baseRy,
        orbitSpacing
      );
      applyOrbitOpacity(orbit, this.ringOpacity(orbit));
    }
  }

  advanceCarousel(deltaTime) {
    this.expandPhase += deltaTime / CAROUSEL_CYCLE_MS;

    if (this.expandPhase < 1 || !this.orbits.length) return;

    this.expandPhase -= 1;

    const outer = this.orbits.reduce((a, b) => (a.slot > b.slot ? a : b));
    if (outer.slot < OUTER_SLOT_LIMIT - 1) return;

    this.onRemoveRing(outer);

    for (const orbit of this.orbits) {
      orbit.slot += 1;
    }

    const yearIdx = this.nextSpawnYearIdx.value % this.allYearGroups.length;
    this.nextSpawnYearIdx.value += 1;
    const newborn = this.onSpawnRing(this.allYearGroups[yearIdx], 0);
    newborn.slot = 0;
    newborn.fadingIn = true;
  }

  tick(time) {
    if (!this.running || !this.visible) return;

    const deltaTime = Math.min(time - this.lastTime, 50);
    this.lastTime = time;

    if (!this.paused && this.carouselEnabled) {
      this.advanceCarousel(deltaTime);
    }

    this.applyCarouselLayout();

    for (const orbit of this.orbits) {
      if (!this.paused) {
        updateOrbitRotation(orbit, deltaTime);
        updateOrbitTilt(orbit, deltaTime);
      }

      orbit.posts.forEach((_, i) => {
        const angle = getPlanetAngle(orbit, i);
        const pos = orbitPosition(orbit.cx, orbit.cy, orbit.rx, orbit.ry, angle, orbit.tilt);
        const el = orbit.planetEls[i];
        if (el) setPlanetPosition(el, pos.x, pos.y);
      });
    }

    this.rafId = requestAnimationFrame((t) => this.tick(t));
  }

  destroy() {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
}

/**
 * @param {HTMLElement} section
 * @param {OrbitAnimation} animation
 */
export function observeSection(section, animation) {
  let inView = false;

  const sync = () => {
    if (inView && !document.hidden) {
      animation.visible = true;
      animation.start();
    } else {
      animation.stop();
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      inView = entries.some((e) => e.isIntersecting);
      sync();
    },
    { threshold: 0.05 }
  );

  observer.observe(section);
  document.addEventListener('visibilitychange', sync);

  return observer;
}
