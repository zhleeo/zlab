(function () {
  "use strict";

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function formatRelative(date) {
    var now = Date.now();
    var then = date.getTime();
    var diff = Math.max(0, now - then);
    var sec = Math.floor(diff / 1000);
    var min = Math.floor(sec / 60);
    var hour = Math.floor(min / 60);
    var day = Math.floor(hour / 24);
    var month = Math.floor(day / 30);
    var year = Math.floor(day / 365);

    if (sec < 60) return "刚刚";
    if (min < 60) return min + " 分钟前";
    if (hour < 24) return hour + " 小时前";
    if (day < 30) return day + " 天前";
    if (month < 12) return month + " 个月前";
    if (year < 2) return "1 年前";
    return year + " 年前";
  }

  function initRelativeTimes(root) {
    root.querySelectorAll("[data-relative-time]").forEach(function (el) {
      var raw = el.getAttribute("datetime");
      if (!raw) return;
      var date = new Date(raw);
      if (isNaN(date.getTime())) return;
      el.textContent = formatRelative(date);
    });
  }

  function initEntry() {
    var page = document.querySelector("[data-posts-list]");
    if (!page) return;

    if (prefersReducedMotion()) {
      page.classList.add("is-visible");
      return;
    }

    requestAnimationFrame(function () {
      page.classList.add("is-visible");
    });
  }

  function initMobileTags(page) {
    var toggle = page.querySelector("[data-posts-tags-toggle]");
    var panel = page.querySelector("[data-posts-tags-panel]");
    if (!toggle || !panel) return;

    function setOpen(open) {
      toggle.classList.toggle("is-active", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      panel.classList.toggle("is-open", open);
      if (open) {
        panel.removeAttribute("hidden");
      } else {
        panel.setAttribute("hidden", "");
      }
    }

    toggle.addEventListener("click", function () {
      setOpen(!panel.classList.contains("is-open"));
    });
  }

  function initPostsList() {
    var page = document.querySelector("[data-posts-list]");
    if (!page) return;

    initRelativeTimes(page);
    initMobileTags(page);

    var container = document.getElementById("posts-list-items");
    var searchInput = page.querySelector("[data-posts-search]");
    var countEl = page.querySelector("[data-posts-count]");
    var sortBtns = page.querySelectorAll("[data-sort]");
    if (!container) return;

    var items = Array.from(container.querySelectorAll("[data-posts-item]"));
    var currentSort = "latest";
    var query = "";

    function applySort() {
      var visible = items.filter(function (item) {
        return !item.classList.contains("is-hidden");
      });

      visible.sort(function (a, b) {
        var dateA = Number(a.getAttribute("data-date"));
        var dateB = Number(b.getAttribute("data-date"));

        if (currentSort === "oldest") return dateA - dateB;
        return dateB - dateA;
      });

      visible.forEach(function (item) {
        container.appendChild(item);
      });
    }

    function applyFilter() {
      var q = query.trim().toLowerCase();
      var visible = 0;

      items.forEach(function (item) {
        var hay = item.getAttribute("data-search") || "";
        var match = !q || hay.indexOf(q) !== -1;
        item.classList.toggle("is-hidden", !match);
        if (match) visible += 1;
      });

      if (countEl) countEl.textContent = String(visible);
      applySort();
    }

    sortBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        currentSort = btn.getAttribute("data-sort") || "latest";
        sortBtns.forEach(function (b) {
          var active = b === btn;
          b.classList.toggle("is-active", active);
          b.setAttribute("aria-pressed", active ? "true" : "false");
        });
        applySort();
      });
    });

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        query = searchInput.value;
        applyFilter();
      });
    }
  }

  function init() {
    initEntry();
    initPostsList();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
