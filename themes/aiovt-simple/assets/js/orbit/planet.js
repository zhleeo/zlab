import { pickSparklePalette } from './data.js';
import { navigateFromOrbit } from './navigate.js';

const PLANET_SIZE = '5.5px';
export const FOCUS_PLANET_SIZE = '16px';

/**
 * @param {HTMLElement} el
 * @param {number} colorIndex
 */
export function applySparklePalette(el, colorIndex) {
  const palette = pickSparklePalette(colorIndex);
  el.style.setProperty('--sparkle-mid', palette.mid);
  el.style.setProperty('--sparkle-glow-near', palette.glowNear);
  el.style.setProperty('--sparkle-glow-far', palette.glowFar);
  el.style.setProperty('--sparkle-halo', palette.halo);
}

/**
 * @param {import('./data.js').Post} post
 * @param {number} colorIndex
 * @param {{ size?: string, focus?: boolean }} [options]
 * @returns {HTMLAnchorElement}
 */
export function createPlanetElement(post, colorIndex, options = {}) {
  const link = document.createElement('a');
  link.href = post.slug;
  link.className = 'orbit-planet';
  if (options.focus) link.classList.add('orbit-planet--focus');
  link.dataset.year = String(post.year);
  link.setAttribute('aria-label', post.title);

  const cats = Array.isArray(post.categories) ? post.categories : [];
  const categories = cats.length ? cats.join(' · ') : '';

  link.innerHTML = `
    <div class="orbit-planet__body orbit-sparkle"></div>
    <div class="orbit-planet__tooltip">
      <div class="orbit-planet__tooltip-title">${escapeHtml(post.title)}</div>
      <div class="orbit-planet__tooltip-meta">${escapeHtml(post.date)}${categories ? ` · ${escapeHtml(categories)}` : ''}</div>
      ${post.summary ? `<div class="orbit-planet__tooltip-summary">${escapeHtml(post.summary)}</div>` : ''}
    </div>
  `;

  const body = link.querySelector('.orbit-planet__body');
  if (body) {
    applySparklePalette(body, colorIndex);
    body.style.setProperty('--planet-size', options.size ?? PLANET_SIZE);
    body.style.setProperty('--breathe-duration', `${4 + Math.random() * 4}s`);
    body.style.setProperty('--breathe-delay', `${Math.random() * 3}s`);
  }

  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigateFromOrbit(link, post.slug, e);
  });

  return link;
}

/**
 * Update an existing planet node in place (avoids DOM churn on carousel shift)
 * @param {HTMLAnchorElement} link
 * @param {import('./data.js').Post} post
 */
export function updatePlanetElement(link, post) {
  link.href = post.slug;
  link.dataset.year = String(post.year);
  link.setAttribute('aria-label', post.title);

  const cats = Array.isArray(post.categories) ? post.categories : [];
  const categories = cats.length ? cats.join(' · ') : '';

  const titleEl = link.querySelector('.orbit-planet__tooltip-title');
  const metaEl = link.querySelector('.orbit-planet__tooltip-meta');
  const summaryEl = link.querySelector('.orbit-planet__tooltip-summary');

  if (titleEl) titleEl.textContent = post.title;
  if (metaEl) {
    metaEl.textContent = categories ? `${post.date} · ${categories}` : post.date;
  }
  if (summaryEl) {
    if (post.summary) {
      summaryEl.textContent = post.summary;
      summaryEl.style.display = '';
    } else {
      summaryEl.textContent = '';
      summaryEl.style.display = 'none';
    }
  } else if (post.summary) {
    const tooltip = link.querySelector('.orbit-planet__tooltip');
    if (tooltip) {
      const div = document.createElement('div');
      div.className = 'orbit-planet__tooltip-summary';
      div.textContent = post.summary;
      tooltip.appendChild(div);
    }
  }
}

/**
 * @param {string} str
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {HTMLElement} el
 * @param {number} x
 * @param {number} y
 */
export function setPlanetPosition(el, x, y) {
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}
