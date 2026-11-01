const MOBILE_MQ = '(max-width: 767px)';
const LOAD_BATCH = 12;
let timelineLoadInitialized = false;

/**
 * @param {string} str
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} iso
 */
function formatTimelineTime(iso) {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return '刚刚';
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`;
  if (sec < 604800) return `${Math.floor(sec / 86400)} 天前`;

  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * @returns {Array<{ index: number, title: string, url: string, date: string, category: string, tags?: string[] }>}
 */
function readTimelineQueue() {
  const jsonEl = document.getElementById('posts-timeline-more');
  if (jsonEl?.textContent?.trim()) {
    try {
      let data = JSON.parse(jsonEl.textContent);
      if (typeof data === 'string') data = JSON.parse(data);
      if (Array.isArray(data)) return data;
    } catch {
      /* fall through */
    }
  }

  const raw = window.__TIMELINE_MORE__;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      let data = JSON.parse(raw);
      if (typeof data === 'string') data = JSON.parse(data);
      if (Array.isArray(data)) return data;
    } catch {
      return [];
    }
  }

  return [];
}

/**
 * @param {string} year
 */
function createYearHeader(year) {
  const li = document.createElement('li');
  li.className = 'posts-timeline__year';
  li.setAttribute('aria-hidden', 'true');
  li.innerHTML = `
    <span class="posts-timeline__year-inner">
      <span class="posts-timeline__year-label">${escapeHtml(year)}</span>
      <span class="posts-timeline__year-line" aria-hidden="true"></span>
    </span>
  `;
  return li;
}

/**
 * @param {HTMLElement} list
 */
function getLastRenderedYear(list) {
  const labels = list.querySelectorAll('.posts-timeline__year-label');
  if (labels.length) return labels[labels.length - 1].textContent || '';

  const lastTime = list.querySelector('.posts-timeline__item:last-child time');
  if (lastTime?.dateTime) return String(new Date(lastTime.dateTime).getFullYear());

  return '';
}

/**
 * @param {{ index: number, title: string, url: string, date: string, year?: string, category: string, tags?: string[] }} post
 */
function createTimelineItem(post) {
  const num = String(post.index + 1).padStart(2, '0');
  const li = document.createElement('li');
  li.className = 'posts-timeline__item';

  const tags = Array.isArray(post.tags) ? post.tags : [];
  const tagsHtml = tags.length
    ? `<span class="posts-timeline__tags">${tags
        .map(
          (tag, j) =>
            `${j ? '<span class="posts-timeline__tag-sep" aria-hidden="true"> · </span>' : ''}<span class="posts-timeline__tag">${escapeHtml(tag)}</span>`
        )
        .join('')}</span>`
    : '';

  li.innerHTML = `
    <a class="posts-timeline__link" href="${escapeHtml(post.url)}">
      <span class="posts-timeline__num" aria-hidden="true">${num}</span>
      <span class="posts-timeline__rail" aria-hidden="true">
        <span class="posts-timeline__seg posts-timeline__seg--top"></span>
        <span class="posts-timeline__seg posts-timeline__seg--gap"></span>
        <span class="posts-timeline__seg posts-timeline__seg--bot"></span>
      </span>
      <span class="posts-timeline__body">
        <span class="posts-timeline__headline">
          <span class="posts-timeline__post-title">${escapeHtml(post.title)}</span>
          <time class="posts-timeline__time" datetime="${escapeHtml(post.date)}">${formatTimelineTime(post.date)}</time>
        </span>
        <span class="posts-timeline__meta">
          <span class="posts-timeline__category">${escapeHtml(post.category)}</span>
        </span>
        ${tagsHtml}
      </span>
    </a>
  `;

  return li;
}

function initTimelineLoadMore() {
  if (!window.matchMedia(MOBILE_MQ).matches) return;
  if (timelineLoadInitialized) return;
  timelineLoadInitialized = true;

  const list = document.getElementById('posts-timeline-list');
  const loadWrap = document.getElementById('posts-timeline-load');
  const expandBtn = document.getElementById('posts-timeline-expand');
  const sentinel = document.getElementById('posts-timeline-sentinel');
  const loadingEl = document.getElementById('posts-timeline-loading');
  const endEl = document.getElementById('posts-timeline-end');
  const allItems = readTimelineQueue();

  if (!list || !loadWrap) return;

  if (!allItems.length) {
    if (expandBtn) expandBtn.hidden = true;
    if (sentinel) sentinel.hidden = true;
    if (endEl) endEl.hidden = false;
    return;
  }

  let cursor = 0;
  let busy = false;
  let done = false;
  let expanded = false;
  let observer = null;
  let lastYear = getLastRenderedYear(list);

  const showEnd = () => {
    done = true;
    if (loadingEl) loadingEl.hidden = true;
    if (endEl) endEl.hidden = false;
    observer?.disconnect();
  };

  const loadMore = () => {
    if (busy || done || !expanded) return;

    if (cursor >= allItems.length) {
      showEnd();
      return;
    }

    busy = true;
    if (loadingEl) loadingEl.hidden = false;

    const batch = allItems.slice(cursor, cursor + LOAD_BATCH);
    cursor += batch.length;

    const fragment = document.createDocumentFragment();
    batch.forEach((post) => {
      const year = post.year || String(new Date(post.date).getFullYear());
      if (year !== lastYear) {
        fragment.appendChild(createYearHeader(year));
        lastYear = year;
      }
      fragment.appendChild(createTimelineItem(post));
    });
    list.appendChild(fragment);

    busy = false;
    if (loadingEl) loadingEl.hidden = true;

    if (cursor >= allItems.length) {
      showEnd();
    }
  };

  const startAutoLoad = () => {
    if (expanded) return;
    expanded = true;

    if (expandBtn) expandBtn.hidden = true;
    if (sentinel) sentinel.hidden = false;
    loadWrap.classList.add('is-expanded');

    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { root: null, rootMargin: '160px 0px', threshold: 0 }
    );

    observer.observe(sentinel);
    loadMore();
  };

  if (expandBtn) {
    expandBtn.addEventListener('click', startAutoLoad);
  } else if (sentinel) {
    startAutoLoad();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTimelineLoadMore);
} else {
  initTimelineLoadMore();
}
