import { orbitPosition, computePlanetAngles } from './data.js';
import { createPlanetElement, FOCUS_PLANET_SIZE, setPlanetPosition } from './planet.js';
import {
  applyOrbitOpacity,
  createOrbitEllipse,
  getStoryRingStroke,
  orbitMotionParams,
  orbitStrokeColor,
  orbitStrokeColorFocused,
  updateOrbitRotation,
  MAX_VISIBLE_RINGS,
} from './orbit.js';

/** base viewport scroll per year (scales with article count) */
const WHEEL_VH_PER_YEAR = 0.11;
const WHEEL_VH_MIN = 5;
const GALAXY_HANDOFF_FRAC = 0.08;
const HANDOFF_END = GALAXY_HANDOFF_FRAC * 0.4;
const ENTER_FRAC = 0.32;
const HOLD_FRAC = 0.36;
const EXIT_FRAC = 0.32;
/** segment position at hold-phase center (full opacity) */
const HOLD_CENTER_FRAC = ENTER_FRAC + HOLD_FRAC / 2;
/** ms after last wheel before snapping to hold center */
const SETTLE_IDLE_MS = 240;
/** tail scroll fraction for story exit animation */
const STORY_EXIT_FRAC = 0.09;
/** preview ring radius as fraction of min(viewport width, height) */
const FOCUS_RING_FRAC = 0.27;

/**
 * @param {number} t
 */
function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * @param {number} t
 */
function smootherstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * @param {WheelEvent} event
 */
function normalizeWheelDelta(event) {
  let delta = event.deltaY;
  if (event.deltaMode === 1) delta *= 16;
  else if (event.deltaMode === 2) delta *= window.innerHeight;
  return delta;
}

/**
 * Wheel-driven year ring focus — page stays fixed while scrolling in place
 */
export class OrbitScrollStory {
  /**
   * @param {object} system
   */
  constructor(system) {
    this.system = system;
    this.pin = document.getElementById('orbit-pin');
    this.focusLayer = document.getElementById('orbit-year-focus');
    this.focusSvg = document.getElementById('orbit-focus-svg');
    this.focusPlanets = document.getElementById('orbit-focus-planets');
    this.focusYearEl = document.getElementById('orbit-focus-year');
    this.focusCountEl = document.getElementById('orbit-focus-count');

    this.active = false;
    this.currentYearIdx = -1;
    /** @type {Array<{ svg: SVGSVGElement, planets: HTMLElement, orbit: import('./data.js').OrbitData|null, yearIdx: number, opacity: number }>} */
    this.focusSlots = [];
    /** @type {number} 0–1 virtual story progress (smoothed display) */
    this.progress = 0;
    /** @type {number} 0–1 wheel target progress */
    this.targetProgress = 0;
    this.sectionTop = 0;
    this.anchorScrollY = null;
    this.galaxyLocked = false;
    this.pinning = false;
    this.storyRafId = 0;
    this.storyLastTime = 0;
    this.focusRingOpacity = 0;
    this.focusOrbitPaused = false;
    this.settling = false;
    this.wheelActive = false;
    this.settleVirtual = -1;
    /** @type {ReturnType<typeof setTimeout>|null} */
    this.wheelIdleTimer = null;
    this.scrollGuardId = 0;

    this.onWheel = this.onWheel.bind(this);
    this.onScroll = this.onScroll.bind(this);
    this.onStoryTick = this.onStoryTick.bind(this);
  }

  getYearCount() {
    return this.system.yearGroups?.length ?? 0;
  }

  getStoryPlayheadEnd() {
    return 1 - STORY_EXIT_FRAC;
  }

  getStorySpan() {
    return this.getStoryPlayheadEnd() - HANDOFF_END;
  }

  getStoryWheelVh() {
    const years = this.getYearCount();
    return Math.max(WHEEL_VH_MIN, years * WHEEL_VH_PER_YEAR + 1.5);
  }

  refreshMetrics() {
    const track = document.getElementById('orbit-track');
    if (track) {
      track.style.minHeight = '100svh';
      track.style.minHeight = '100dvh';
    }
    this.updateSectionTop();
  }

  updateSectionTop() {
    const section = this.system.section;
    if (!section) return;
    this.sectionTop = Math.round(window.scrollY + section.getBoundingClientRect().top);
  }

  isOrbitFullyVisible() {
    const pin = this.pin;
    if (!pin) return false;
    const vh = window.innerHeight;
    const rect = pin.getBoundingClientRect();
    const heightOk = rect.height >= vh * 0.92;
    return rect.top <= 12 && rect.bottom >= vh - 12 && heightOk;
  }

  getScrollAnchor() {
    return this.anchorScrollY ?? this.sectionTop;
  }

  startScrollGuard() {
    if (this.scrollGuardId) return;
    const tick = () => {
      const guard = (this.galaxyLocked || this.isInStory()) && !this.isStoryComplete();
      if (guard) {
        this.pinScrollPosition();
        this.scrollGuardId = requestAnimationFrame(tick);
      } else {
        this.scrollGuardId = 0;
      }
    };
    this.scrollGuardId = requestAnimationFrame(tick);
  }

  stopScrollGuard() {
    if (!this.scrollGuardId) return;
    cancelAnimationFrame(this.scrollGuardId);
    this.scrollGuardId = 0;
  }

  isInStory() {
    return this.progress > 0 || this.targetProgress > 0;
  }

  isStoryComplete() {
    return this.progress >= 1 || this.targetProgress >= 1;
  }

  setGalaxyLocked(locked) {
    this.galaxyLocked = locked;
    const galaxyPhase = locked && !this.isInStory() && !this.isStoryComplete();
    const storyPhase = this.isInStory() && !this.isStoryComplete();
    this.system.section?.classList.toggle('orbit-section--galaxy-locked', galaxyPhase);
    document.body.classList.toggle('orbit-scroll-locked', galaxyPhase || storyPhase);
  }

  snapToGalaxyLock() {
    this.updateSectionTop();
    this.anchorScrollY = this.sectionTop;
    this.setGalaxyLocked(true);
    this.startScrollGuard();
    if (Math.abs(window.scrollY - this.anchorScrollY) > 1) {
      window.scrollTo({ top: this.anchorScrollY, behavior: 'auto' });
    }
  }

  releaseGalaxyLock() {
    this.setGalaxyLocked(false);
    this.anchorScrollY = null;
    if (!this.isInStory()) this.stopScrollGuard();
  }

  refreshStoryRingStroke() {
    const stroke = getStoryRingStroke();
    for (const slot of this.focusSlots) {
      slot.orbit?.ellipseEl?.setAttribute('stroke', stroke);
    }
  }

  /**
   * @param {number} progress
   */
  progressToVirtual(progress) {
    const years = this.getYearCount();
    if (!years || progress <= HANDOFF_END) return 0;
    if (progress >= this.getStoryPlayheadEnd()) return years;
    const storyT = (progress - HANDOFF_END) / this.getStorySpan();
    return clamp(storyT, 0, 1) * years;
  }

  /**
   * @param {number} virtual
   */
  virtualToProgress(virtual) {
    const years = this.getYearCount();
    if (!years || virtual <= 0) return 0;
    const storyT = clamp(virtual / years, 0, 1);
    return HANDOFF_END + storyT * this.getStorySpan();
  }

  /**
   * Nearest year hold-center (full-opacity frame) for a virtual position
   * @param {number} virtual
   */
  findSettleVirtual(virtual) {
    const years = this.getYearCount();
    if (!years) return HOLD_CENTER_FRAC;

    virtual = clamp(virtual, 0, years - 1 + HOLD_CENTER_FRAC);
    let nearest = HOLD_CENTER_FRAC;
    let minDist = Infinity;

    for (let i = 0; i < years; i++) {
      const center = i + HOLD_CENTER_FRAC;
      const dist = Math.abs(virtual - center);
      if (dist < minDist) {
        minDist = dist;
        nearest = center;
      }
    }

    return nearest;
  }

  /**
   * @param {number} yearIdx
   */
  getHoldVirtual(yearIdx) {
    return yearIdx + HOLD_CENTER_FRAC;
  }

  /**
   * @param {boolean} paused
   */
  setFocusPaused(paused) {
    this.focusOrbitPaused = paused;
    if (!paused && this.active) {
      this.startStoryLoop();
    }
  }

  /**
   * Snap scroll target to nearest year hold center (full-opacity frame)
   */
  scheduleSettle() {
    this.wheelIdleTimer = null;
    this.wheelActive = false;

    if (this.progress <= HANDOFF_END) return;
    if (this.progress >= this.getStoryPlayheadEnd()) return;

    const virtual = this.progressToVirtual(this.targetProgress);
    const holdVirtual = this.findSettleVirtual(virtual);
    const holdProgress = this.virtualToProgress(holdVirtual);

    if (Math.abs(this.targetProgress - holdProgress) < 0.00004) {
      this.settling = false;
      this.settleVirtual = holdVirtual;
      return;
    }

    this.settleVirtual = holdVirtual;
    this.targetProgress = holdProgress;
    this.settling = true;
    this.startStoryLoop();
  }

  queueSettleAfterIdle() {
    if (this.wheelIdleTimer) clearTimeout(this.wheelIdleTimer);
    this.wheelIdleTimer = setTimeout(() => this.scheduleSettle(), SETTLE_IDLE_MS);
  }

  /**
   * Limit wheel input so one gesture cannot skip multiple years at once.
   * @param {number} deltaProgress
   */
  clampWheelStep(deltaProgress) {
    const years = this.getYearCount();
    if (!years) return deltaProgress;
    const perYear = this.getStorySpan() / years;
    const maxStep = perYear * 0.72;
    return clamp(deltaProgress, -maxStep, maxStep);
  }

  init() {
    if (
      !this.pin ||
      !this.focusLayer ||
      !this.focusSvg ||
      !this.focusPlanets ||
      !this.system.yearGroups?.length ||
      !this.system.section
    ) {
      return;
    }

    this.setupFocusSlots();
    this.refreshMetrics();

    window.addEventListener('wheel', this.onWheel, { passive: false, capture: true });
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', () => {
      this.system.applyViewportLayout();
      this.refreshMetrics();
      for (const slot of this.focusSlots) {
        if (slot.orbit) this.applyFocusGeometry(slot.orbit);
      }
      this.renderProgress();
    });
    window.addEventListener('load', () => {
      this.refreshMetrics();
      this.renderProgress();
    });

    requestAnimationFrame(() => {
      this.refreshMetrics();
      this.renderProgress();
    });
  }

  pinScrollPosition() {
    const anchor = this.getScrollAnchor();
    if (Math.abs(window.scrollY - anchor) > 1) {
      window.scrollTo({ top: anchor, behavior: 'auto' });
    }
  }

  /**
   * @param {number} delta
   */
  applyStoryWheel(delta) {
    if (delta > 0 && this.targetProgress >= 1) return;

    const vh = window.innerHeight;
    const rawStep = delta / (vh * this.getStoryWheelVh());
    const step = this.clampWheelStep(rawStep);

    this.wheelActive = true;
    this.settling = false;
    this.settleVirtual = -1;

    let next = clamp(this.targetProgress + step, 0, 1);
    if (delta > 0 && this.targetProgress <= 0) {
      next = Math.max(next, HANDOFF_END + 0.04);
      this.progress = Math.max(this.progress, HANDOFF_END + 0.03);
    }

    this.targetProgress = next;
    this.startScrollGuard();
    this.renderProgress();
    this.startStoryLoop();
    this.queueSettleAfterIdle();
  }

  /**
   * @param {WheelEvent} event
   */
  onWheel(event) {
    const years = this.getYearCount();
    if (!years) return;

    const delta = normalizeWheelDelta(event);
    if (this.isStoryComplete() && delta > 0) return;

    const fullyVisible = this.isOrbitFullyVisible();
    const inStory = this.isInStory();

    if (!inStory && fullyVisible && !this.isStoryComplete()) {
      if (delta < 0) {
        if (this.galaxyLocked) this.releaseGalaxyLock();
        return;
      }

      if (!this.galaxyLocked) this.snapToGalaxyLock();
      event.preventDefault();
      event.stopPropagation();
      this.pinScrollPosition();
      this.applyStoryWheel(delta);
      return;
    }

    if (!this.galaxyLocked && !inStory) return;

    if (!inStory && delta < 0) {
      this.releaseGalaxyLock();
      return;
    }

    if (delta > 0 && this.targetProgress >= 1) return;

    event.preventDefault();
    event.stopPropagation();
    this.pinScrollPosition();
    this.applyStoryWheel(delta);
  }

  onScroll() {
    if (document.body.classList.contains('posts-view--timeline')) return;

    this.refreshMetrics();
    const scrollY = window.scrollY;
    const anchor = this.getScrollAnchor();

    if (this.isStoryComplete()) {
      this.stopScrollGuard();
      this.releaseGalaxyLock();
      return;
    }

    if (this.isInStory()) {
      if (!this.anchorScrollY) this.snapToGalaxyLock();
      if (Math.abs(scrollY - anchor) > 1) this.pinScrollPosition();
      return;
    }

    if (this.isOrbitFullyVisible()) {
      if (!this.galaxyLocked) {
        this.snapToGalaxyLock();
      } else if (scrollY > anchor + 1) {
        this.pinScrollPosition();
      } else if (scrollY < anchor - 8) {
        this.releaseGalaxyLock();
      }
      return;
    }

    if (scrollY < this.sectionTop - 60) {
      this.releaseGalaxyLock();
      this.wheelActive = false;
      this.system.section?.classList.remove('orbit-section--story-locked');
    }
  }

  startStoryLoop() {
    if (this.storyRafId) return;
    this.storyLastTime = performance.now();
    this.storyRafId = requestAnimationFrame(this.onStoryTick);
  }

  stopStoryLoop() {
    if (!this.storyRafId) return;
    cancelAnimationFrame(this.storyRafId);
    this.storyRafId = 0;
  }

  onStoryTick(time) {
    const dt = Math.min(time - this.storyLastTime, 50);
    this.storyLastTime = time;

    let needsNextFrame = false;

    const progressGap = this.targetProgress - this.progress;
    if (Math.abs(progressGap) > 0.00002) {
      const prevYear = Math.floor(this.progressToVirtual(this.progress));
      let alphaRate = 0.016;
      if (this.wheelActive) alphaRate = 0.055;
      else if (this.settling) alphaRate = 0.026;

      const alpha = 1 - Math.exp(-dt * alphaRate);
      this.progress += progressGap * alpha;

      if (Math.abs(this.targetProgress - this.progress) < 0.00002) {
        this.progress = this.targetProgress;
        if (this.settling) this.settleVirtual = this.findSettleVirtual(this.progressToVirtual(this.progress));
        this.settling = false;
      }

      const nextYear = Math.floor(this.progressToVirtual(this.progress));
      if (!this.settling && nextYear > prevYear + 1) {
        this.progress = this.virtualToProgress(prevYear + 1.001);
      } else if (!this.settling && nextYear < prevYear - 1) {
        this.progress = this.virtualToProgress(prevYear - 1 + 0.999);
      }

      if (this.galaxyLocked || this.isInStory()) this.pinScrollPosition();
      this.renderProgress();
      needsNextFrame = true;
    }

    if (this.active) {
      for (const slot of this.focusSlots) {
        if (slot.orbit && slot.opacity > 0.01) {
          if (!this.focusOrbitPaused) {
            updateOrbitRotation(slot.orbit, dt);
          }
          this.updateSlotPlanets(slot);
        }
      }
      if (!this.focusOrbitPaused) needsNextFrame = true;
    }

    if (needsNextFrame || Math.abs(this.targetProgress - this.progress) > 0.00002) {
      this.storyRafId = requestAnimationFrame(this.onStoryTick);
    } else {
      this.storyRafId = 0;
    }
  }

  renderProgress() {
    const years = this.system.yearGroups?.length ?? 0;
    if (!years) return;

    const locked = this.progress > 0 && this.progress < 1;
    this.system.section?.classList.toggle('orbit-section--story-locked', locked);
    document.body.classList.toggle(
      'orbit-scroll-locked',
      locked || (this.galaxyLocked && !this.isStoryComplete())
    );

    if (this.progress <= 0) {
      this.setStoryActive(false);
      this.setBackgroundDim(0);
      return;
    }

    if (this.progress >= 1) {
      this.applyStoryEnd(1);
      this.finishStoryExit();
      return;
    }

    if (this.progress >= this.getStoryPlayheadEnd()) {
      const exitT = clamp(
        (this.progress - this.getStoryPlayheadEnd()) / STORY_EXIT_FRAC,
        0,
        1
      );
      this.setStoryActive(true);
      this.applyStoryEnd(exitT);
      return;
    }

    /** while scrolling: follow wheel for live crossfade; after stop: smooth settle */
    const frameProgress = this.wheelActive ? this.targetProgress : this.progress;
    const galaxyDim = smoothstep(Math.min(1, frameProgress / GALAXY_HANDOFF_FRAC));

    if (frameProgress <= HANDOFF_END) {
      this.setStoryActive(false);
      this.setBackgroundDim(galaxyDim * 0.35);
      return;
    }

    const storyT = (frameProgress - HANDOFF_END) / this.getStorySpan();
    const virtual = clamp(storyT, 0, 1) * years;
    let yearIdx = Math.min(years - 1, Math.floor(virtual));
    let segmentT = virtual - yearIdx;

    const holdVirtual = this.findSettleVirtual(virtual);
    const atHold =
      !this.wheelActive &&
      !this.settling &&
      Math.abs(virtual - holdVirtual) < 0.006;

    if (this.settling && this.settleVirtual >= 0) {
      yearIdx = Math.min(years - 1, Math.floor(this.settleVirtual));
      const settleSeg = this.settleVirtual - yearIdx;
      segmentT = lerp(segmentT, settleSeg, 0.22);
      if (Math.abs(segmentT - settleSeg) < 0.004) segmentT = settleSeg;
    } else if (atHold) {
      yearIdx = Math.min(years - 1, Math.floor(holdVirtual));
      segmentT = HOLD_CENTER_FRAC;
      this.settleVirtual = holdVirtual;
    }

    this.setStoryActive(true);
    this.applyStoryFrame(yearIdx, segmentT, galaxyDim, holdVirtual);
  }

  /**
   * Dim strength at the handoff → story boundary (keeps fade continuous)
   */
  getHandoffPeakDim() {
    return smoothstep(HANDOFF_END / GALAXY_HANDOFF_FRAC) * 0.35;
  }

  /**
   * @param {number} amount 0–1 background dim/blur strength
   */
  setBackgroundDim(amount) {
    const dim = clamp(amount, 0, 1);
    if (!this.system.root) return;

    if (dim <= 0.0001) {
      this.system.root.style.removeProperty('--orbit-story-dim');
      return;
    }

    this.system.root.style.setProperty('--orbit-story-dim', String(dim));
  }

  /**
   * @param {boolean} on
   * @param {boolean} [ended]
   */
  setStoryActive(on, ended = false) {
    this.active = on;

    if (on) {
      this.focusLayer?.removeAttribute('hidden');
      this.focusLayer?.classList.add('is-active');
      this.startStoryLoop();
      return;
    }

    this.setBackgroundDim(0);

    if (ended) {
      this.finishStoryExit();
      return;
    }

    this.focusLayer?.classList.remove('is-active', 'orbit-year-focus--leaving');
    this.focusLayer?.setAttribute('hidden', '');
    if (this.focusLayer) this.focusLayer.style.opacity = '0';
  }

  setupFocusSlots() {
    if (!this.focusLayer || !this.focusSvg || !this.focusPlanets) return;

    const meta = this.focusLayer.querySelector('.orbit-year-focus__meta');
    const altSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    altSvg.setAttribute('class', 'orbit-year-focus__svg orbit-year-focus__svg--alt');
    altSvg.setAttribute('aria-hidden', 'true');

    const altPlanets = document.createElement('div');
    altPlanets.className = 'orbit-year-focus__planets orbit-year-focus__planets--alt';

    if (meta) {
      this.focusLayer.insertBefore(altSvg, meta);
      this.focusLayer.insertBefore(altPlanets, meta);
    } else {
      this.focusLayer.appendChild(altSvg);
      this.focusLayer.appendChild(altPlanets);
    }

    this.focusSlots = [
      { svg: this.focusSvg, planets: this.focusPlanets, orbit: null, yearIdx: -1, opacity: 0 },
      { svg: altSvg, planets: altPlanets, orbit: null, yearIdx: -1, opacity: 0 },
    ];
  }

  /**
   * @param {{ svg: SVGSVGElement, planets: HTMLElement, orbit: import('./data.js').OrbitData|null, yearIdx: number, opacity: number }} slot
   * @param {number} yearIdx
   */
  mountSlotYear(slot, yearIdx) {
    const group = this.system.yearGroups[yearIdx];
    if (!group) return;

    slot.svg.innerHTML = '';
    slot.planets.innerHTML = '';

    const motion = orbitMotionParams(group.year, MAX_VISIBLE_RINGS);
    const layout = this.getFocusLayout();
    /** @type {import('./data.js').OrbitData} */
    const orbit = {
      year: group.year,
      index: 0,
      totalCount: 1,
      radius: layout.rx,
      rx: layout.rx,
      ry: layout.rx,
      cx: layout.cx,
      cy: layout.cy,
      tilt: 0,
      stroke: orbitStrokeColor(0, 1),
      strokeFocused: orbitStrokeColorFocused(0, 1),
      tiltSpeed: 0,
      speed: motion.speed,
      direction: motion.direction,
      rotation: motion.rotation,
      posts: group.posts,
      baseAngles: computePlanetAngles(group.posts.length, group.year),
      ellipseEl: null,
      labelEl: null,
      planetEls: [],
    };

    createOrbitEllipse(slot.svg, orbit);
    orbit.ellipseEl?.classList.add('is-story-focus');
    this.applyFocusGeometry(orbit);

    const colorBase = yearIdx * 3;
    group.posts.forEach((post, i) => {
      const el = createPlanetElement(post, colorBase + i, {
        size: FOCUS_PLANET_SIZE,
        focus: true,
      });
      el.addEventListener('pointerenter', () => {
        this.setFocusPaused(true);
      });
      el.addEventListener('pointerleave', () => {
        this.setFocusPaused(false);
      });
      slot.planets.appendChild(el);
      orbit.planetEls.push(el);
    });

    slot.orbit = orbit;
    slot.yearIdx = yearIdx;
  }

  /**
   * @param {{ svg: SVGSVGElement, planets: HTMLElement, orbit: import('./data.js').OrbitData|null, yearIdx: number, opacity: number }} slot
   * @param {number} yearIdx
   */
  ensureSlotYear(slot, yearIdx) {
    if (slot.yearIdx !== yearIdx || !slot.orbit) {
      this.mountSlotYear(slot, yearIdx);
    } else {
      this.applyFocusGeometry(slot.orbit);
    }
  }

  /**
   * @param {{ svg: SVGSVGElement, planets: HTMLElement, orbit: import('./data.js').OrbitData|null, yearIdx: number, opacity: number }} slot
   */
  hideSlot(slot) {
    slot.opacity = 0;
    if (slot.orbit) applyOrbitOpacity(slot.orbit, 0);
    slot.planets.style.opacity = '0';
    slot.planets.style.pointerEvents = 'none';
  }

  /**
   * @param {{ svg: SVGSVGElement, planets: HTMLElement, orbit: import('./data.js').OrbitData|null, yearIdx: number, opacity: number }} slot
   * @param {number} opacity
   */
  applySlotFrame(slot, opacity) {
    if (!slot.orbit) return;

    const ringOpacity = clamp(opacity, 0, 1);
    slot.opacity = ringOpacity;

    this.applyFocusGeometry(slot.orbit);
    applyOrbitOpacity(slot.orbit, Math.min(1, ringOpacity * 1.05));
    slot.planets.style.opacity = String(ringOpacity);
    slot.planets.style.pointerEvents = ringOpacity > 0.55 ? 'auto' : 'none';
    this.updateSlotPlanets(slot);
  }

  /**
   * @param {{ svg: SVGSVGElement, planets: HTMLElement, orbit: import('./data.js').OrbitData|null, yearIdx: number, opacity: number }} slot
   */
  updateSlotPlanets(slot) {
    const orbit = slot.orbit;
    if (!orbit) return;

    const ringOpacity = slot.opacity;
    orbit.posts.forEach((_, i) => {
      const angle = orbit.baseAngles[i] + orbit.rotation;
      const pos = orbitPosition(orbit.cx, orbit.cy, orbit.rx, orbit.ry, angle, 0);
      const el = orbit.planetEls[i];
      if (!el) return;

      setPlanetPosition(el, pos.x, pos.y);
      el.style.opacity = String(ringOpacity);
      el.style.pointerEvents = ringOpacity > 0.55 ? 'auto' : 'none';
    });
  }

  getFocusLayout() {
    const vh = this.system.viewportH || window.innerHeight;
    const vw = this.system.viewportW || window.innerWidth;

    return {
      rx: Math.min(vw, vh) * FOCUS_RING_FRAC,
      cx: vw / 2,
      cy: vh / 2,
    };
  }

  /**
   * @param {import('./data.js').OrbitData} orbit
   */
  applyFocusGeometry(orbit) {
    const layout = this.getFocusLayout();
    orbit.rx = layout.rx;
    orbit.ry = layout.rx;
    orbit.cx = layout.cx;
    orbit.cy = layout.cy;
    orbit.tilt = 0;

    if (!orbit.ellipseEl) return;

    orbit.ellipseEl.setAttribute('cx', String(orbit.cx));
    orbit.ellipseEl.setAttribute('cy', String(orbit.cy));
    orbit.ellipseEl.setAttribute('rx', String(orbit.rx));
    orbit.ellipseEl.setAttribute('ry', String(orbit.ry));
    orbit.ellipseEl.setAttribute('transform', '');
    orbit.ellipseEl.setAttribute('stroke', getStoryRingStroke());
  }

  /**
   * @param {number} yearIdx
   * @param {number} segmentT
   * @param {number} galaxyDim
   * @param {number} [holdVirtual]
   */
  applyStoryFrame(yearIdx, segmentT, galaxyDim, holdVirtual = -1) {
    const years = this.getYearCount();
    if (!years || this.focusSlots.length < 2) return;

    const [slotA, slotB] = this.focusSlots;
    const enterEnd = ENTER_FRAC;
    const holdEnd = ENTER_FRAC + HOLD_FRAC;
    const atHoldCenter = Math.abs(segmentT - HOLD_CENTER_FRAC) < 0.008;

    const inEnter = !atHoldCenter && segmentT < enterEnd;
    const isLastYear = yearIdx >= years - 1;
    const inExit = !atHoldCenter && segmentT > holdEnd && !isLastYear;
    const enterT = inEnter ? smootherstep(segmentT / enterEnd) : 1;
    const exitT = inExit ? smootherstep((segmentT - holdEnd) / EXIT_FRAC) : 0;
    const soloOpacity = atHoldCenter ? 1 : enterT * (1 - exitT);

    let metaOpacity = soloOpacity;
    let displayYearIdx = yearIdx;
    this.currentYearIdx = yearIdx;

    if (atHoldCenter) {
      displayYearIdx = yearIdx;
      metaOpacity = 1;
      this.ensureSlotYear(slotA, yearIdx);
      this.applySlotFrame(slotA, 1);
      this.hideSlot(slotB);
    } else if (inEnter && yearIdx > 0) {
      const blend = enterT;
      this.ensureSlotYear(slotA, yearIdx - 1);
      this.ensureSlotYear(slotB, yearIdx);
      this.applySlotFrame(slotA, 1 - blend);
      this.applySlotFrame(slotB, blend);
      metaOpacity = Math.max(blend, 1 - blend);
      displayYearIdx = blend >= 0.5 ? yearIdx : yearIdx - 1;
    } else if (inExit && yearIdx < years - 1) {
      const blend = exitT;
      this.ensureSlotYear(slotA, yearIdx);
      this.ensureSlotYear(slotB, yearIdx + 1);
      this.applySlotFrame(slotA, 1 - blend);
      this.applySlotFrame(slotB, blend);
      metaOpacity = Math.max(1 - blend, blend);
      displayYearIdx = blend >= 0.5 ? yearIdx + 1 : yearIdx;
    } else {
      this.ensureSlotYear(slotA, yearIdx);
      this.applySlotFrame(slotA, soloOpacity);
      this.hideSlot(slotB);
      displayYearIdx = yearIdx;
    }

    if (holdVirtual >= 0 && !this.wheelActive) {
      const holdYear = Math.min(years - 1, Math.floor(holdVirtual));
      if (atHoldCenter || (!inEnter && !inExit && soloOpacity > 0.92)) {
        displayYearIdx = holdYear;
      }
    }

    const displayGroup = this.system.yearGroups[displayYearIdx];
    if (displayGroup) {
      if (this.focusYearEl) this.focusYearEl.textContent = String(displayGroup.year);
      if (this.focusCountEl) {
        this.focusCountEl.textContent = `${displayGroup.posts.length} 篇文章`;
      }
    }

    this.focusRingOpacity = metaOpacity;

    if (this.focusYearEl) this.focusYearEl.style.opacity = String(metaOpacity);
    if (this.focusCountEl) this.focusCountEl.style.opacity = String(metaOpacity * 0.85);

    const bgDim = Math.max(
      galaxyDim * 0.35,
      atHoldCenter
        ? 0.85
        : lerp(this.getHandoffPeakDim(), 0.85, smootherstep(enterT)) * (1 - exitT * 0.35)
    );
    this.setBackgroundDim(bgDim);

    if (this.focusLayer) this.focusLayer.style.opacity = '1';
  }

  /**
   * Fade out preview layer and restore galaxy at story end
   * @param {number} exitT 0–1
   */
  applyStoryEnd(exitT) {
    const years = this.getYearCount();
    if (!years || this.focusSlots.length < 2) return;

    const t = clamp(exitT, 0, 1);
    const fade = 1 - smootherstep(t);
    const scale = lerp(1, 0.94, smootherstep(t));
    const [slotA, slotB] = this.focusSlots;
    const lastIdx = years - 1;
    const group = this.system.yearGroups[lastIdx];

    this.focusLayer?.classList.add('orbit-year-focus--leaving');
    this.ensureSlotYear(slotA, lastIdx);
    this.applySlotFrame(slotA, fade);
    this.hideSlot(slotB);
    this.focusRingOpacity = fade;

    if (group) {
      if (this.focusYearEl) {
        this.focusYearEl.textContent = String(group.year);
        this.focusYearEl.style.opacity = String(fade);
      }
      if (this.focusCountEl) {
        this.focusCountEl.textContent = `${group.posts.length} 篇文章`;
        this.focusCountEl.style.opacity = String(fade * 0.85);
      }
    }

    this.setBackgroundDim(lerp(0.85, 0, smootherstep(t)));

    if (this.focusLayer) {
      this.focusLayer.style.opacity = String(fade);
      this.focusLayer.style.setProperty('--focus-exit-scale', String(scale));
    }
  }

  finishStoryExit() {
    this.active = false;
    this.focusOrbitPaused = false;
    this.wheelActive = false;
    this.settling = false;
    this.settleVirtual = -1;
    this.stopScrollGuard();
    this.releaseGalaxyLock();
    this.setBackgroundDim(0);
    this.focusLayer?.classList.remove('is-active', 'orbit-year-focus--leaving');
    this.focusLayer?.setAttribute('hidden', '');
    if (this.focusLayer) {
      this.focusLayer.style.opacity = '0';
      this.focusLayer.style.removeProperty('--focus-exit-scale');
    }
    this.currentYearIdx = -1;
    for (const slot of this.focusSlots) {
      this.hideSlot(slot);
      slot.yearIdx = -1;
      slot.orbit = null;
    }
  }

  destroy() {
    if (this.wheelIdleTimer) clearTimeout(this.wheelIdleTimer);
    this.stopStoryLoop();
    this.stopScrollGuard();
    window.removeEventListener('wheel', this.onWheel, { capture: true });
    window.removeEventListener('scroll', this.onScroll);
    this.releaseGalaxyLock();
    document.body.classList.remove('orbit-scroll-locked');
    this.system.section?.classList.remove('orbit-section--story-locked');
    this.setBackgroundDim(0);
  }
}
