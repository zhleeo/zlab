(function () {
  "use strict";

  var LOAD_BATCH = 12;
  var loadInitialized = false;

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function readMeta() {
    var el = document.getElementById("archives-meta");
    if (!el || !el.textContent.trim()) return { yearCounts: {} };

    try {
      var data = JSON.parse(el.textContent);
      if (typeof data === "string") data = JSON.parse(data);
      return data && typeof data === "object" ? data : { yearCounts: {} };
    } catch (e) {
      return { yearCounts: {} };
    }
  }

  function readQueue() {
    var el = document.getElementById("archives-more");
    if (!el || !el.textContent.trim()) return [];

    try {
      var data = JSON.parse(el.textContent);
      if (typeof data === "string") data = JSON.parse(data);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function createArchiveItem(post) {
    var li = document.createElement("li");
    li.className = "archive-item archive-item--lazy";
    li.setAttribute("data-archive-item", "");
    li.setAttribute("data-post-path", post.postPath || post.url || "");

    li.innerHTML =
      '<time class="archive-item__date" datetime="' +
      escapeHtml(post.date) +
      '">' +
      escapeHtml(post.day) +
      '</time>' +
      '<a class="archive-item__title" href="' +
      escapeHtml(post.url) +
      '">' +
      escapeHtml(post.title) +
      '</a>' +
      '<span class="archive-item__cat">' +
      '<svg class="archive-item__mark" viewBox="0 0 12 16" width="10" height="13" aria-hidden="true" fill="currentColor">' +
      '<path d="M2 0h8a1 1 0 0 1 1 1v14.5a.5.5 0 0 1-.78.414L6 13.5l-4.22 2.414A.5.5 0 0 1 1 15.5V1a1 1 0 0 1 1-1z"/>' +
      "</svg>" +
      escapeHtml(post.cat || "随笔") +
      "</span>";

    return li;
  }

  function ensureYearSection(timeline, year, yearCounts, yearIndex) {
    var section = document.getElementById("archive-year-" + year);
    if (section) return section;

    section = document.createElement("section");
    section.className = "archive-year archive-year--lazy";
    section.id = "archive-year-" + year;
    section.setAttribute("data-archive-year", year);
    section.style.setProperty("--year-index", String(yearIndex));

    var count = yearCounts[year] || 0;
    section.innerHTML =
      '<header class="archive-year__head">' +
      '<h2 class="archive-year__title">' +
      escapeHtml(year) +
      "</h2>" +
      '<span class="archive-year__count">本年 ' +
      count +
      " 篇</span>" +
      "</header>";

    timeline.appendChild(section);
    return section;
  }

  function ensureMonthSection(yearSection, post) {
    var monthId = "archive-year-" + post.year + "-month-" + post.month;
    var month = document.getElementById(monthId);
    if (month) return month.querySelector(".archive-list");

    month = document.createElement("div");
    month.className = "archive-month archive-month--lazy";
    month.id = monthId;
    month.setAttribute("data-archive-month", post.year + "-" + post.month);
    month.innerHTML =
      '<h3 class="archive-month__title">' +
      '<span class="archive-month__cn">' +
      escapeHtml(post.monthCN || post.month) +
      '</span><span class="archive-month__sep" aria-hidden="true">·</span>' +
      '<span class="archive-month__en">' +
      escapeHtml(post.monthEN || post.month) +
      "</span></h3>" +
      '<ul class="archive-list"></ul>';

    yearSection.appendChild(month);
    return month.querySelector(".archive-list");
  }

  function initEntry() {
    var page = document.querySelector("[data-archives]");
    if (!page) return;

    if (prefersReducedMotion()) {
      page.classList.add("is-visible");
      return;
    }

    requestAnimationFrame(function () {
      page.classList.add("is-visible");
    });
  }

  function extractPostPath(url) {
    try {
      var u = new URL(url, window.location.origin);
      if (u.origin !== window.location.origin) return "";
      if (!u.pathname.includes("/posts/")) return "";
      return u.pathname.replace(/\/$/, "") + "/";
    } catch (e) {
      return "";
    }
  }

  function initCurrentPost() {
    var fromReferrer = extractPostPath(document.referrer);
    var params = new URLSearchParams(window.location.search);
    var fromParam = params.get("from") || params.get("post") || "";
    var target = fromParam ? extractPostPath(fromParam) || fromParam : fromReferrer;

    if (!target) return;

    if (!target.endsWith("/")) target += "/";

    document.querySelectorAll("[data-archive-item]").forEach(function (item) {
      var path = item.getAttribute("data-post-path") || "";
      if (path === target || path.replace(/\/$/, "") === target.replace(/\/$/, "")) {
        item.classList.add("is-current");
        item.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      }
    });
  }

  function initScrollSpy() {
    var years = document.querySelectorAll("[data-archive-year]");
    var months = document.querySelectorAll("[data-archive-month]");
    if (!years.length) return null;

    var yearLinks = document.querySelectorAll("[data-sidebar-year]");
    var monthLinks = document.querySelectorAll("[data-sidebar-month]");
    var offset = 120;

    function setActive(links, attr, value) {
      links.forEach(function (link) {
        link.classList.toggle("is-active", link.getAttribute(attr) === value);
      });
    }

    function updateScrollSpy() {
      years = document.querySelectorAll("[data-archive-year]");
      months = document.querySelectorAll("[data-archive-month]");

      var scrollY = window.scrollY + offset;
      var activeYear = "";
      var activeMonth = "";

      years.forEach(function (section) {
        if (section.offsetTop <= scrollY) {
          activeYear = section.getAttribute("data-archive-year");
        }
      });

      months.forEach(function (section) {
        if (section.offsetTop <= scrollY) {
          activeMonth = section.getAttribute("data-archive-month");
        }
      });

      years.forEach(function (section) {
        section.classList.toggle("is-active", section.getAttribute("data-archive-year") === activeYear);
      });

      months.forEach(function (section) {
        section.classList.toggle("is-active", section.getAttribute("data-archive-month") === activeMonth);
      });

      if (activeYear) setActive(yearLinks, "data-sidebar-year", activeYear);
      if (activeMonth) setActive(monthLinks, "data-sidebar-month", activeMonth);
    }

    var scrollRaf = 0;
    function onScroll() {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(function () {
        scrollRaf = 0;
        updateScrollSpy();
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    updateScrollSpy();

    return updateScrollSpy;
  }

  function initMobileNav(onNavigate) {
    var toggle = document.querySelector(".archives-mobile-nav__toggle");
    var panel = document.getElementById("archives-mobile-panel");
    var tabs = document.querySelectorAll("[data-mobile-tab]");
    var panes = document.querySelectorAll("[data-mobile-pane]");

    if (!toggle || !panel) return;

    toggle.addEventListener("click", function () {
      var open = panel.hasAttribute("hidden");
      if (open) {
        panel.removeAttribute("hidden");
        toggle.setAttribute("aria-expanded", "true");
      } else {
        panel.setAttribute("hidden", "");
        toggle.setAttribute("aria-expanded", "false");
      }
    });

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var name = tab.getAttribute("data-mobile-tab");
        tabs.forEach(function (t) {
          t.classList.toggle("is-active", t === tab);
        });
        panes.forEach(function (pane) {
          pane.classList.toggle("is-active", pane.getAttribute("data-mobile-pane") === name);
        });
        panel.removeAttribute("hidden");
        toggle.setAttribute("aria-expanded", "true");
      });
    });

    panel.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener("click", function (event) {
        var hash = link.getAttribute("href");
        if (!hash || hash.charAt(0) !== "#") return;

        event.preventDefault();
        panel.setAttribute("hidden", "");
        toggle.setAttribute("aria-expanded", "false");

        onNavigate(hash.slice(1), function () {
          var target = document.getElementById(hash.slice(1));
          if (target) {
            target.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
          }
        });
      });
    });

    panel.querySelectorAll('a:not([href^="#"])').forEach(function (link) {
      link.addEventListener("click", function () {
        panel.setAttribute("hidden", "");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  function initLoadMore(refreshScrollSpy) {
    if (loadInitialized) return;

    var timeline = document.getElementById("archives-timeline");
    var loadWrap = document.getElementById("archives-load");
    var sentinel = document.getElementById("archives-sentinel");
    var loadingEl = document.getElementById("archives-loading");
    var endEl = document.getElementById("archives-end");
    var allItems = readQueue();
    var meta = readMeta();
    var yearCounts = meta.yearCounts || {};

    if (!timeline || !loadWrap || !allItems.length) {
      if (endEl && allItems.length === 0) endEl.hidden = false;
      return;
    }

    var batchAttr = Number(loadWrap.dataset.batch);
    if (batchAttr > 0) LOAD_BATCH = batchAttr;

    loadInitialized = true;

    var cursor = 0;
    var busy = false;
    var done = false;
    var lazyYearIndex = timeline.querySelectorAll(".archive-year").length;
    var observer = null;

    function showEnd() {
      done = true;
      if (loadingEl) loadingEl.hidden = true;
      if (endEl) endEl.hidden = false;
      observer?.disconnect();
    }

    function loadMore() {
      if (busy || done) return false;

      if (cursor >= allItems.length) {
        showEnd();
        return false;
      }

      busy = true;
      if (loadingEl) loadingEl.hidden = false;

      var batch = allItems.slice(cursor, cursor + LOAD_BATCH);
      cursor += batch.length;

      batch.forEach(function (post) {
        var yearSection = ensureYearSection(timeline, post.year, yearCounts, lazyYearIndex);
        if (yearSection.classList.contains("archive-year--lazy")) {
          lazyYearIndex += 1;
          yearSection.classList.remove("archive-year--lazy");
        }
        var list = ensureMonthSection(yearSection, post);
        list.appendChild(createArchiveItem(post));
      });

      busy = false;
      if (loadingEl) loadingEl.hidden = true;

      if (typeof refreshScrollSpy === "function") refreshScrollSpy();

      if (cursor >= allItems.length) showEnd();
      return true;
    }

    function ensureAnchor(id, callback) {
      if (document.getElementById(id)) {
        callback();
        return;
      }

      if (done || cursor >= allItems.length) {
        callback();
        return;
      }

      var guard = 0;
      function step() {
        if (document.getElementById(id)) {
          callback();
          return;
        }
        if (!loadMore() || guard > 200) {
          callback();
          return;
        }
        guard += 1;
        requestAnimationFrame(step);
      }

      step();
    }

    observer = new IntersectionObserver(
      function (entries) {
        if (entries.some(function (entry) {
          return entry.isIntersecting;
        })) {
          loadMore();
        }
      },
      { root: null, rootMargin: "180px 0px", threshold: 0 }
    );

    if (sentinel) observer.observe(sentinel);

    if (window.location.hash) {
      ensureAnchor(window.location.hash.slice(1), function () {
        var target = document.getElementById(window.location.hash.slice(1));
        if (target) target.scrollIntoView({ block: "start", behavior: "auto" });
      });
    }

    return ensureAnchor;
  }

  function init() {
    initEntry();
    var refreshScrollSpy = initScrollSpy();
    initCurrentPost();
    var ensureAnchor =
      initLoadMore(refreshScrollSpy) ||
      function (_id, callback) {
        callback();
      };
    initMobileNav(ensureAnchor);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
