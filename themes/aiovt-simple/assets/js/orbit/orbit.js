import { computePlanetAngles, orbitPosition, SPARKLE_PALETTES } from './data.js';

/** Maximum rings shown at once */
export const MAX_VISIBLE_RINGS = 10;

/** ms for one ring-spacing of outward drift */
export const CAROUSEL_CYCLE_MS = 11000;

/** slot value at which the outermost ring is removed */
export const OUTER_SLOT_LIMIT = MAX_VISIBLE_RINGS;

/** effective-slot span for inner ring fade-in (synced with expansion) */
export const INNER_FADE_SLOT = 0.42;
/** Fixed stroke at innermost / outermost visible ring (fallback) */
const STROKE_FALLBACK = {
  inner: { r: 214, g: 132, b: 152, a: 0.46 },
  outer: { r: 245, g: 215, b: 222, a: 0.16 },
  focusedInner: { r: 224, g: 148, b: 168, a: 0.56 },
  focusedOuter: { r: 250, g: 225, b: 232, a: 0.24 },
};

/**
 * @param {string} prefix
 * @param {{ r: number, g: number, b: number, a: number }} fallback
 */
function readStrokeToken(prefix, fallback) {
  const style = getComputedStyle(document.documentElement);
  const rgb = style.getPropertyValue(prefix).trim();
  const aRaw = style.getPropertyValue(`${prefix}-a`).trim();
  if (!rgb) return fallback;

  const parts = rgb.split(/[\s,]+/).map((value) => Number(value.trim()));
  if (parts.length < 3 || parts.some((value) => Number.isNaN(value))) return fallback;

  const alpha = aRaw ? Number(aRaw) : fallback.a;
  return {
    r: parts[0],
    g: parts[1],
    b: parts[2],
    a: Number.isNaN(alpha) ? fallback.a : alpha,
  };
}

function strokeTokens() {
  return {
    inner: readStrokeToken('--orbit-stroke-inner', STROKE_FALLBACK.inner),
    outer: readStrokeToken('--orbit-stroke-outer', STROKE_FALLBACK.outer),
    focusedInner: readStrokeToken('--orbit-stroke-focused-inner', STROKE_FALLBACK.focusedInner),
    focusedOuter: readStrokeToken('--orbit-stroke-focused-outer', STROKE_FALLBACK.focusedOuter),
  };
}

/**
 * @param {{ r: number, g: number, b: number, a: number }} token
 */
function tokenToRgba(token) {
  return `rgba(${token.r}, ${token.g}, ${token.b}, ${token.a.toFixed(3)})`;
}

/**
 * @param {{ r: number, g: number, b: number, a: number }} inner
 * @param {{ r: number, g: number, b: number, a: number }} outer
 * @param {number} t
 */
function lerpToken(inner, outer, t) {
  return tokenToRgba(lerpTokenObject(inner, outer, t));
}

/**
 * @param {SVGSVGElement} svg
 */
function getOrCreateDefs(svg) {
  const ns = 'http://www.w3.org/2000/svg';
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(ns, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  return defs;
}

/**
 * @param {number} year
 * @param {boolean} [focused]
 */
function ringGradId(year, focused = false) {
  return `orbit-ring-lg-y${year}${focused ? '-f' : ''}`;
}

/**
 * @param {{ r: number, g: number, b: number, a: number }} inner
 * @param {{ r: number, g: number, b: number, a: number }} outer
 * @param {number} t
 */
function lerpTokenObject(inner, outer, t) {
  return {
    r: Math.round(inner.r + (outer.r - inner.r) * t),
    g: Math.round(inner.g + (outer.g - inner.g) * t),
    b: Math.round(inner.b + (outer.b - inner.b) * t),
    a: inner.a + (outer.a - inner.a) * t,
  };
}

/**
 * @param {string} hex
 */
function parseHexColor(hex) {
  const value = hex.replace('#', '').trim();
  if (value.length !== 6) return { r: 232, g: 145, b: 154 };
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

/**
 * @param {string} color
 */
function parseColor(color) {
  const raw = color.trim();
  if (raw.startsWith('#')) return parseHexColor(raw);

  const match = raw.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/i);
  if (!match) return { r: 232, g: 145, b: 154 };

  return {
    r: Math.round(Number(match[1])),
    g: Math.round(Number(match[2])),
    b: Math.round(Number(match[3])),
  };
}

/**
 * Multi-hue stops for one ring stroke (rose · peach · amber · blush · lavender · sage)
 * @param {number} year
 * @param {number} index
 * @param {number} total
 * @param {boolean} [focused]
 */
function ringStrokeColors(year, index, total, focused = false) {
  const base = Math.abs(year) % SPARKLE_PALETTES.length;
  const offsets = [0, 1, 3, 4];
  const slotT = total <= 1 ? 0 : index / (total - 1);
  const alpha = focused ? 0.62 - slotT * 0.14 : 0.46 - slotT * 0.22;

  return offsets.map((offset, stopIdx) => {
    const palette = SPARKLE_PALETTES[(base + offset) % SPARKLE_PALETTES.length];
    const source = focused
      ? palette.glowNear
      : stopIdx % 2 === 0
        ? palette.mid
        : palette.glowNear;
    const rgb = parseColor(source);
    return { ...rgb, a: Math.max(0.12, alpha) };
  });
}

/**
 * @param {SVGLinearGradientElement} grad
 * @param {Array<{ r: number, g: number, b: number, a: number }>} colors
 */
function setRingGradientStops(grad, colors) {
  const ns = 'http://www.w3.org/2000/svg';
  const offsets = ['0%', '28%', '58%', '100%'];

  grad.replaceChildren();
  colors.forEach((color, i) => {
    const stop = document.createElementNS(ns, 'stop');
    stop.setAttribute('offset', offsets[i] ?? '100%');
    stop.setAttribute('stop-color', tokenToRgba(color));
    grad.appendChild(stop);
  });
}

/**
 * @param {SVGDefsElement} defs
 * @param {string} id
 */
function getOrCreateLinearGradient(defs, id) {
  const ns = 'http://www.w3.org/2000/svg';
  let grad = defs.querySelector(`#${id}`);
  if (!grad) {
    grad = document.createElementNS(ns, 'linearGradient');
    grad.setAttribute('id', id);
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');
    defs.appendChild(grad);
  }
  return grad;
}

/**
 * @param {import('./data.js').OrbitData} orbit
 * @param {SVGLinearGradientElement} grad
 */
function updateRingGradientGeometry(orbit, grad) {
  const p1 = orbitPosition(orbit.cx, orbit.cy, orbit.rx, orbit.ry, 0, orbit.tilt);
  const p2 = orbitPosition(orbit.cx, orbit.cy, orbit.rx, orbit.ry, Math.PI, orbit.tilt);
  grad.setAttribute('x1', String(p1.x));
  grad.setAttribute('y1', String(p1.y));
  grad.setAttribute('x2', String(p2.x));
  grad.setAttribute('y2', String(p2.y));
}

/**
 * @param {import('./data.js').OrbitData} orbit
 * @param {SVGSVGElement} svg
 * @param {{ index: number, total: number, focused?: boolean }} options
 */
export function updateRingGradient(orbit, svg, options) {
  if (!orbit.ellipseEl || !svg) return;

  const { index, total, focused = false } = options;
  const id = ringGradId(orbit.year, focused);
  const defs = getOrCreateDefs(svg);
  const grad = getOrCreateLinearGradient(defs, id);
  const colors = ringStrokeColors(orbit.year, index, total, focused);

  setRingGradientStops(grad, colors);
  updateRingGradientGeometry(orbit, grad);
}

/**
 * @param {SVGSVGElement} svg
 * @param {import('./data.js').OrbitData[]} orbits
 * @param {{ focusedYear?: number|null }} [options]
 */
export function syncAllRingGradients(svg, orbits, options = {}) {
  if (!svg || !orbits.length) return;

  const sorted = [...orbits].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  const total = sorted.length;
  const { focusedYear = null } = options;

  sorted.forEach((orbit, index) => {
    orbit.index = index;
    updateRingGradient(orbit, svg, { index, total, focused: false });
    updateRingGradient(orbit, svg, { index, total, focused: true });
    applyOrbitStroke(orbit, focusedYear === orbit.year);
  });
}

/** @deprecated use syncAllRingGradients */
export function updateOrbitRingGradients(svg, layout, orbits = [], options = {}) {
  if (svg && orbits.length) syncAllRingGradients(svg, orbits, options);
}

/**
 * @param {number} index 0 = innermost ring
 * @param {number} total
 * @param {{ r: number, g: number, b: number, a: number }} inner
 * @param {{ r: number, g: number, b: number, a: number }} outer
 */
function lerpOrbitStroke(index, total, inner, outer) {
  const t = total <= 1 ? 0 : index / (total - 1);
  return lerpToken(inner, outer, t);
}

/**
 * Innermost ring deeper, outermost ring lighter (index 0 = innermost)
 * @param {number} index
 * @param {number} total
 */
export function orbitStrokeColor(index, total) {
  const tokens = strokeTokens();
  return lerpOrbitStroke(index, total, tokens.inner, tokens.outer);
}

/**
 * @param {number} index
 * @param {number} total
 */
export function orbitStrokeColorFocused(index, total) {
  const tokens = strokeTokens();
  return lerpOrbitStroke(index, total, tokens.focusedInner, tokens.focusedOuter);
}

export function getStoryRingStroke() {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--orbit-story-ring-stroke')
    .trim();
  return value || 'rgba(200, 110, 130, 0.82)';
}

/**
 * @param {import('./data.js').OrbitData} orbit
 * @param {boolean} [focused]
 */
export function applyOrbitStroke(orbit, focused = false) {
  if (!orbit.ellipseEl) return;
  orbit.ellipseEl.setAttribute('stroke', `url(#${ringGradId(orbit.year, focused)})`);
}

/**
 * Ring size follows slot drift only — same outward speed for every ring
 * @param {import('./data.js').OrbitData} orbit
 * @param {number} slot continuous outward slot
 * @param {number} baseRx
 * @param {number} baseRy
 * @param {number} spacing
 */
export function setOrbitRingRadii(orbit, effectiveSlot, baseRx, baseRy, spacing) {
  const s = Math.max(0, effectiveSlot);
  orbit.rx = baseRx + s * spacing;
  orbit.ry = baseRy + s * spacing * 0.45;
  if (orbit.ellipseEl) {
    orbit.ellipseEl.setAttribute('rx', String(orbit.rx));
    orbit.ellipseEl.setAttribute('ry', String(orbit.ry));
    const svg = orbit.ellipseEl.ownerSVGElement;
    if (svg) {
      for (const focused of [false, true]) {
        const grad = svg.querySelector(`#${ringGradId(orbit.year, focused)}`);
        if (grad) updateRingGradientGeometry(orbit, grad);
      }
    }
  }
}

/**
 * @param {import('./data.js').OrbitData} orbit
 * @param {number} effectiveSlot continuous ring index (0 = innermost)
 * @param {number} baseRx
 * @param {number} baseRy
 * @param {number} spacing
 */
export function setOrbitEffectiveSlot(orbit, effectiveSlot, baseRx, baseRy, spacing) {
  setOrbitRingRadii(orbit, effectiveSlot, baseRx, baseRy, spacing);
}

/**
 * @param {import('./data.js').OrbitData} orbit
 * @param {number} slotIndex
 * @param {number} expandProgress 0–1 extra ring spacing
 * @param {number} baseRx
 * @param {number} baseRy
 * @param {number} spacing
 */
export function setOrbitSlotRadii(orbit, slotIndex, expandProgress, baseRx, baseRy, spacing) {
  setOrbitEffectiveSlot(orbit, slotIndex + expandProgress, baseRx, baseRy, spacing);
}

/**
 * @param {import('./data.js').OrbitData} orbit
 * @param {number} opacity
 */
export function applyOrbitOpacity(orbit, opacity) {
  const value = String(opacity);
  if (orbit.ellipseEl) orbit.ellipseEl.style.opacity = value;
  for (const el of orbit.planetEls) el.style.opacity = value;
}

/**
 * @param {import('./data.js').YearGroup} group
 * @param {number} motionKey unique per ring (e.g. year)
 * @param {number} cx
 * @param {number} cy
 * @param {number} orbitSpacing
 * @param {number} baseRx
 * @param {number} baseRy
 */
export function createOrbitSlot(group, motionKey, cx, cy, orbitSpacing, baseRx, baseRy) {
  const total = MAX_VISIBLE_RINGS;
  const motion = orbitMotionParams(motionKey, total);
  const rx = baseRx;
  const ry = baseRy;

  return {
    year: group.year,
    motionKey,
    index: 0,
    totalCount: total,
    radius: rx,
    rx,
    ry,
    cx,
    cy,
    tilt: motion.tilt,
    stroke: orbitStrokeColor(0, total),
    strokeFocused: orbitStrokeColorFocused(0, total),
    tiltSpeed: motion.tiltSpeed,
    speed: motion.speed,
    direction: motion.direction,
    rotation: motion.rotation,
    posts: group.posts,
    baseAngles: computePlanetAngles(group.posts.length, motionKey),
    ellipseEl: null,
    labelEl: null,
    planetEls: [],
  };
}

/** Golden angle for even phase distribution */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Per-ring motion (use year or unique id — not display slot index)
 * @param {number} motionKey
 * @param {number} total
 */
export function orbitMotionParams(motionKey, total) {
  const band = ((motionKey % total) + total) % total;
  const direction = motionKey % 2 === 0 ? 1 : -1;
  const speed = 0.00011 + band * 0.000022 + (motionKey % 5) * 0.000004;
  const tiltSpeed = 0.000018 * (motionKey % 2 === 0 ? 1 : -1) * (1 + band * 0.15);
  const rotation = (motionKey * GOLDEN_ANGLE) % (Math.PI * 2);
  const tilt = (band / Math.max(1, total)) * Math.PI * 0.88 + (motionKey % 7) * 0.09;

  return { direction, speed, tiltSpeed, rotation, tilt };
}

/**
 * @param {import('./data.js').YearGroup} group
 * @param {number} index
 * @param {number} total
 * @param {number} cx
 * @param {number} cy
 * @param {number} orbitSpacing
 * @param {number} baseRx
 * @param {number} baseRy
 */
export function createOrbit(group, index, total, cx, cy, orbitSpacing, baseRx, baseRy) {
  const rx = baseRx + index * orbitSpacing;
  const ry = baseRy + index * (orbitSpacing * 0.45);
  const motion = orbitMotionParams(index, total);

  return {
    year: group.year,
    index,
    totalCount: total,
    radius: rx,
    rx,
    ry,
    cx,
    cy,
    tilt: motion.tilt,
    stroke: orbitStrokeColor(index, total),
    strokeFocused: orbitStrokeColorFocused(index, total),
    tiltSpeed: motion.tiltSpeed,
    speed: motion.speed,
    direction: motion.direction,
    rotation: motion.rotation,
    posts: group.posts,
    baseAngles: computePlanetAngles(group.posts.length, index),
    ellipseEl: null,
    labelEl: null,
    planetEls: [],
  };
}

/**
 * @param {import('./data.js').OrbitData} orbit
 * @param {number} deltaTime
 */
export function updateOrbitRotation(orbit, deltaTime) {
  orbit.rotation += deltaTime * orbit.speed * orbit.direction;
}

/**
 * @param {import('./data.js').OrbitData} orbit
 * @param {number} deltaTime
 */
export function updateOrbitTilt(orbit, deltaTime) {
  orbit.tilt += deltaTime * orbit.tiltSpeed;
  applyEllipseTransform(orbit);
}

/**
 * @param {import('./data.js').OrbitData} orbit
 */
export function applyEllipseTransform(orbit) {
  if (!orbit.ellipseEl) return;
  const deg = (orbit.tilt * 180) / Math.PI;
  orbit.ellipseEl.setAttribute('transform', `rotate(${deg} ${orbit.cx} ${orbit.cy})`);

  const svg = orbit.ellipseEl.ownerSVGElement;
  if (!svg) return;
  for (const focused of [false, true]) {
    const grad = svg.querySelector(`#${ringGradId(orbit.year, focused)}`);
    if (grad) updateRingGradientGeometry(orbit, grad);
  }
}

/**
 * @param {import('./data.js').OrbitData} orbit
 * @param {number} postIndex
 */
export function getPlanetAngle(orbit, postIndex) {
  return orbit.baseAngles[postIndex] + orbit.rotation;
}

/**
 * @param {SVGGElement} svg
 * @param {import('./data.js').OrbitData} orbit
 * @param {{ behind?: boolean }} [options]
 */
export function createOrbitEllipse(svg, orbit, options = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const ellipse = document.createElementNS(ns, 'ellipse');
  ellipse.setAttribute('cx', String(orbit.cx));
  ellipse.setAttribute('cy', String(orbit.cy));
  ellipse.setAttribute('rx', String(orbit.rx));
  ellipse.setAttribute('ry', String(orbit.ry));
  ellipse.dataset.year = String(orbit.year);
  if (options.behind && svg.firstChild) {
    svg.insertBefore(ellipse, svg.firstChild);
  } else {
    svg.appendChild(ellipse);
  }
  orbit.ellipseEl = ellipse;
  applyOrbitStroke(orbit);
  applyEllipseTransform(orbit);
  return ellipse;
}

/**
 * @param {HTMLElement} container
 * @param {import('./data.js').OrbitData} orbit
 */
export function createYearLabel(container, orbit) {
  const label = document.createElement('span');
  label.className = 'orbit-year-label';
  label.textContent = String(orbit.year);
  label.dataset.year = String(orbit.year);

  const angle = -Math.PI * 0.72;
  const x = orbit.cx + orbit.rx * Math.cos(angle);
  const y = orbit.cy + orbit.ry * Math.sin(angle);
  label.style.left = `${x}px`;
  label.style.top = `${y}px`;

  container.appendChild(label);
  orbit.labelEl = label;
  return label;
}

/**
 * @param {import('./data.js').OrbitData[]} orbits
 * @param {number} cx
 * @param {number} cy
 * @param {number} orbitSpacing
 * @param {number} baseRx
 * @param {number} baseRy
 */
export function buildOrbits(yearGroups, cx, cy, orbitSpacing, baseRx, baseRy) {
  return yearGroups.map((group, index) =>
    createOrbit(group, index, yearGroups.length, cx, cy, orbitSpacing, baseRx, baseRy)
  );
}

/**
 * @param {import('./data.js').YearGroup[]} yearGroups visible window
 * @param {number} cx
 * @param {number} cy
 * @param {number} orbitSpacing
 * @param {number} baseRx
 * @param {number} baseRy
 */
export function buildVisibleOrbits(yearGroups, cx, cy, orbitSpacing, baseRx, baseRy) {
  return yearGroups.map((group, index) =>
    createOrbitSlot(group, index, cx, cy, orbitSpacing, baseRx, baseRy)
  );
}

/**
 * @param {import('./data.js').OrbitData[]} orbits
 * @param {number} padding
 */
export function computeStageSize(orbits, padding = 80) {
  if (!orbits.length) return { width: 400, height: 300 };

  let maxHalf = 0;
  for (const o of orbits) {
    const cosT = Math.cos(o.tilt);
    const sinT = Math.sin(o.tilt);
    const halfW = Math.sqrt(o.rx * o.rx * cosT * cosT + o.ry * o.ry * sinT * sinT);
    const halfH = Math.sqrt(o.rx * o.rx * sinT * sinT + o.ry * o.ry * cosT * cosT);
    maxHalf = Math.max(maxHalf, halfW, halfH);
  }

  return {
    width: (maxHalf + padding) * 2,
    height: (maxHalf + padding) * 2,
  };
}
