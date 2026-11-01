(function () {
  'use strict';

  var root = document.querySelector('[data-search]');
  if (!root) return;

  var input = root.querySelector('[data-search-input]');
  var resultsEl = root.querySelector('[data-search-results]');
  var emptyEl = root.querySelector('[data-search-empty]');
  var indexUrl = root.dataset.indexUrl || '/index.json';
  var sectionLabels = {};

  try {
    sectionLabels = JSON.parse(root.dataset.sectionLabels || '{}');
  } catch (e) {
    sectionLabels = { posts: '文章', thoughts: '动态' };
  }

  var pages = [];
  var indexLoaded = false;
  var indexLoading = false;
  var debounceTimer = 0;
  var lastFocused = null;

  function sectionLabel(section) {
    return sectionLabels[section] || section;
  }

  function normalize(text) {
    return (text || '').toLowerCase().trim();
  }

  function loadIndex() {
    if (indexLoaded || indexLoading) {
      return indexLoading
        ? loadIndex.waiting || Promise.resolve()
        : Promise.resolve();
    }

    indexLoading = true;
    loadIndex.waiting = fetch(indexUrl, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('index fetch failed');
        return res.json();
      })
      .then(function (data) {
        pages = (data && data.pages) || [];
        indexLoaded = true;
      })
      .catch(function () {
        pages = [];
        indexLoaded = true;
      })
      .finally(function () {
        indexLoading = false;
      });

    return loadIndex.waiting;
  }

  function scorePage(page, query) {
    var title = normalize(page.title);
    var summary = normalize(page.summary);
    var tags = (page.tags || []).map(normalize).join(' ');
    var score = 0;

    if (title === query) score += 120;
    if (title.indexOf(query) === 0) score += 80;
    if (title.indexOf(query) !== -1) score += 50;
    if (summary.indexOf(query) !== -1) score += 20;
    if (tags.indexOf(query) !== -1) score += 25;

    query.split(/\s+/).filter(Boolean).forEach(function (token) {
      if (title.indexOf(token) !== -1) score += 15;
      if (summary.indexOf(token) !== -1) score += 6;
      if (tags.indexOf(token) !== -1) score += 8;
    });

    return score;
  }

  function renderResults(items) {
    resultsEl.innerHTML = '';

    if (!items.length) {
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;

    items.forEach(function (item, index) {
      var li = document.createElement('li');
      li.className = 'site-search__item';
      li.style.setProperty('--motion-i', String(index));
      li.setAttribute('role', 'option');

      var link = document.createElement('a');
      link.className = 'site-search__link';
      link.href = item.url;
      link.innerHTML =
        '<span class="site-search__item-title">' +
        escapeHtml(item.title) +
        '</span>' +
        (item.summary
          ? '<span class="site-search__item-summary">' + escapeHtml(item.summary) + '</span>'
          : '') +
        '<span class="site-search__item-meta">' +
        '<span class="site-search__item-section">' +
        escapeHtml(sectionLabel(item.section)) +
        '</span>' +
        (item.date ? '<time class="site-search__item-date">' + escapeHtml(item.date) + '</time>' : '') +
        '</span>';

      if (index === 0) {
        link.setAttribute('tabindex', '0');
      } else {
        link.setAttribute('tabindex', '-1');
      }

      li.appendChild(link);
      resultsEl.appendChild(li);
    });
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function runSearch() {
    var query = normalize(input.value);
    if (!query) {
      emptyEl.hidden = true;
      resultsEl.innerHTML = '';
      return;
    }

    var matches = pages
      .map(function (page) {
        return { page: page, score: scorePage(page, query) };
      })
      .filter(function (entry) {
        return entry.score > 0;
      })
      .sort(function (a, b) {
        return b.score - a.score;
      })
      .slice(0, 12)
      .map(function (entry) {
        return entry.page;
      });

    renderResults(matches);
  }

  function openSearch() {
    lastFocused = document.activeElement;
    root.hidden = false;
    document.body.classList.add('is-search-open');

    loadIndex().then(function () {
      input.focus();
      input.select();
      runSearch();
    });
  }

  function closeSearch() {
    root.hidden = true;
    document.body.classList.remove('is-search-open');
    input.value = '';
    resultsEl.innerHTML = '';
    emptyEl.hidden = true;

    if (lastFocused && lastFocused.focus) {
      lastFocused.focus();
    }
  }

  function onInput() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(runSearch, 120);
  }

  document.querySelectorAll('[data-search-open]').forEach(function (btn) {
    btn.addEventListener('click', openSearch);
  });

  root.querySelectorAll('[data-search-close]').forEach(function (el) {
    el.addEventListener('click', closeSearch);
  });

  input.addEventListener('input', onInput);

  document.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (root.hidden) openSearch();
      else closeSearch();
      return;
    }

    if (event.key === 'Escape' && !root.hidden) {
      event.preventDefault();
      closeSearch();
    }
  });
})();
