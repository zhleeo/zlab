/** @typedef {{ title: string, slug: string, date: string, year: number, summary: string, categories: string[] }} Post */
/** @typedef {{ year: number, posts: Post[] }} YearGroup */
/** @typedef {{ year: number, radius: number, rx: number, ry: number, cx: number, cy: number, tilt: number, tiltSpeed: number, speed: number, direction: 1|-1, rotation: number, posts: Post[], baseAngles: number[], ellipseEl: SVGEllipseElement|null, labelEl: HTMLElement|null, planetEls: HTMLElement[] }} OrbitData */

/** Theme-cohesive sparkle palettes (rose · peach · amber · blush · lavender · sage) */
export const SPARKLE_PALETTES = [
  {
    mid: '#ff9eb2',
    glowNear: 'rgba(255, 175, 195, 0.98)',
    glowFar: 'rgba(255, 195, 210, 0.82)',
    halo: 'rgba(255, 220, 190, 0.55)',
  },
  {
    mid: '#ffb894',
    glowNear: 'rgba(255, 190, 155, 0.96)',
    glowFar: 'rgba(255, 210, 180, 0.78)',
    halo: 'rgba(255, 230, 200, 0.52)',
  },
  {
    mid: '#ffd060',
    glowNear: 'rgba(255, 220, 120, 0.95)',
    glowFar: 'rgba(255, 235, 165, 0.76)',
    halo: 'rgba(255, 245, 200, 0.5)',
  },
  {
    mid: '#ff9ec8',
    glowNear: 'rgba(255, 180, 210, 0.96)',
    glowFar: 'rgba(255, 200, 225, 0.78)',
    halo: 'rgba(255, 220, 235, 0.48)',
  },
  {
    mid: '#c8aeff',
    glowNear: 'rgba(210, 185, 255, 0.94)',
    glowFar: 'rgba(225, 205, 255, 0.74)',
    halo: 'rgba(235, 225, 255, 0.46)',
  },
  {
    mid: '#98ddd0',
    glowNear: 'rgba(175, 230, 215, 0.92)',
    glowFar: 'rgba(195, 245, 230, 0.72)',
    halo: 'rgba(210, 250, 240, 0.44)',
  },
];

/**
 * @param {number} index
 */
export function pickSparklePalette(index) {
  return SPARKLE_PALETTES[index % SPARKLE_PALETTES.length];
}

/**
 * @param {Post[]} posts
 * @returns {YearGroup[]}
 */
export function groupPostsByYear(posts) {
  /** @type {Map<number, Post[]>} */
  const map = new Map();

  for (const post of posts) {
    const year = post.year;
    if (!map.has(year)) map.set(year, []);
    map.get(year).push(post);
  }

  return [...map.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, yearPosts]) => ({
      year,
      posts: yearPosts.sort((a, b) => new Date(b.date) - new Date(a.date)),
    }));
}

/**
 * @param {number} min
 * @param {number} max
 */
export function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Even planet placement; single-post years get a unique phase per ring
 * @param {number} count
 * @param {number} seed
 */
export function computePlanetAngles(count, seed) {
  if (count <= 0) return [];
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const offset = (seed * GOLDEN) % (Math.PI * 2);
  if (count === 1) return [offset];
  return Array.from({ length: count }, (_, i) => offset + (Math.PI * 2 * i) / count);
}

/**
 * @param {number} count
 */
export function computeBaseAngles(count) {
  return computePlanetAngles(count, 0);
}

/**
 * @param {number} cx
 * @param {number} cy
 * @param {number} rx
 * @param {number} ry
 * @param {number} angle parametric angle on ellipse
 * @param {number} [tilt] plane rotation in radians
 */
export function orbitPosition(cx, cy, rx, ry, angle, tilt = 0) {
  const ex = rx * Math.cos(angle);
  const ey = ry * Math.sin(angle);
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);
  return {
    x: cx + ex * cosT - ey * sinT,
    y: cy + ex * sinT + ey * cosT,
  };
}
