const NAV_KEY = 'post-nav-from-orbit';
const LOADER_SKIP_KEY = 'site-loader-skip';
const NAV_DURATION = 520;

function markSkipLoader() {
  try {
    sessionStorage.setItem(LOADER_SKIP_KEY, '1');
  } catch {
    /* private mode */
  }
}

/**
 * @param {number} x
 * @param {number} y
 */
function coverRadius(x, y) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return (
    Math.max(
      Math.hypot(x, y),
      Math.hypot(w - x, y),
      Math.hypot(x, h - y),
      Math.hypot(w - x, h - y)
    ) + 28
  );
}

let navigating = false;

/**
 * @param {HTMLAnchorElement} link
 * @param {string} slug
 * @param {MouseEvent} event
 */
export function navigateFromOrbit(link, slug, event) {
  if (navigating) return;
  navigating = true;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    markSkipLoader();
    window.location.href = slug;
    return;
  }

  const system = document.getElementById('orbit-system');
  const focusLayer = document.getElementById('orbit-year-focus');
  const x = event.clientX;
  const y = event.clientY;
  const radius = coverRadius(x, y);

  link.classList.add('orbit-planet--leaving');
  system?.classList.add('orbit-system--navigating');
  focusLayer?.classList.add('orbit-system--navigating');

  document.querySelectorAll('.orbit-planet').forEach((planet) => {
    if (planet !== link) planet.classList.add('orbit-planet--dimmed');
  });

  document.body.classList.add('orbit-nav-lock');

  const overlay = document.createElement('div');
  overlay.className = 'orbit-nav-transition';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.setProperty('--orbit-nav-x', `${x}px`);
  overlay.style.setProperty('--orbit-nav-y', `${y}px`);
  overlay.style.setProperty('--orbit-nav-r', `${radius}px`);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.classList.add('is-active');
  });

  try {
    sessionStorage.setItem(NAV_KEY, '1');
    sessionStorage.setItem(LOADER_SKIP_KEY, '1');
  } catch {
    /* private mode */
  }

  window.setTimeout(() => {
    window.location.href = slug;
  }, NAV_DURATION);
}

export { NAV_KEY };
