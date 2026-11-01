import { initTwikooReplyCollapse } from "./twikoo-replies.js";
import { whenTwikooReady as loadTwikooWhenReady } from "./twikoo-loader.js";

(function () {
  "use strict";

  var loadInitialized = false;

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
    var scope = root || document;
    scope.querySelectorAll("[data-relative-time]").forEach(function (el) {
      var card = el.closest("[data-date]");
      var raw = card ? card.getAttribute("data-date") : el.getAttribute("datetime");
      if (!raw) return;
      var date = new Date(raw);
      if (isNaN(date.getTime())) return;
      el.textContent = formatRelative(date);
    });
  }

  function initPostProse(root) {
    document.dispatchEvent(
      new CustomEvent("post-prose:init", {
        detail: { root: root || document },
      })
    );
  }

  function getTwikooConfig() {
    var page = document.querySelector("[data-thoughts]");
    if (!page) return null;

    return {
      cssUrl: page.getAttribute("data-twikoo-css") || "",
      jsUrl: page.getAttribute("data-twikoo-cdn") || "",
    };
  }

  function whenTwikooReady(fn) {
    loadTwikooWhenReady(getTwikooConfig(), fn);
  }

  function initTwikooHost(host) {
    if (!host || host.dataset.twikooReady === "1") return;

    var mountId = host.getAttribute("data-twikoo-el");
    var mount = mountId ? document.getElementById(mountId) : null;
    var envId = host.getAttribute("data-twikoo-env");
    if (!mount || !envId || typeof twikoo === "undefined") return;

    twikoo.init({
      envId: envId,
      el: "#" + mountId,
      path: host.getAttribute("data-twikoo-path") || location.pathname,
      lang: host.getAttribute("data-twikoo-lang") || "zh-CN",
      onCommentLoaded: function () {
        host.classList.add("is-ready");
        host.dataset.twikooReady = "1";
        initTwikooReplyCollapse(host);
      },
    });
  }

  function closeCommentsPanel(panel, options) {
    if (!panel || panel.hidden) return;

    var opts = options || {};
    panel.hidden = true;
    panel.classList.remove("is-open");

    var targetId = panel.id;
    var trigger = targetId
      ? document.querySelector('[data-thought-comment-trigger][data-target="' + targetId + '"]')
      : null;
    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
    }

    if (opts.updateHash !== false && targetId && location.hash === "#" + targetId && history.replaceState) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  function closeAllCommentsPanels(exceptPanel) {
    document.querySelectorAll(".thought-card__comments.is-open").forEach(function (panel) {
      if (panel !== exceptPanel) {
        closeCommentsPanel(panel, { updateHash: false });
      }
    });
  }

  function isCommentsPanelOpen(panel) {
    return !!(panel && !panel.hidden && panel.classList.contains("is-open"));
  }

  function openCommentsPanel(panel, options) {
    if (!panel) return;

    var opts = options || {};
    closeAllCommentsPanels(panel);

    panel.hidden = false;
    panel.classList.add("is-open");

    var targetId = panel.id;
    var trigger = targetId
      ? document.querySelector('[data-thought-comment-trigger][data-target="' + targetId + '"]')
      : null;
    if (trigger) {
      trigger.setAttribute("aria-expanded", "true");
    }

    var host = panel.querySelector(".thought-card__comments-host");
    whenTwikooReady(function () {
      initTwikooHost(host);
    });

    if (opts.updateHash !== false) {
      if (targetId && history.replaceState) {
        history.replaceState(null, "", "#" + targetId);
      }
    }

    if (opts.scroll !== false) {
      window.requestAnimationFrame(function () {
        panel.scrollIntoView({
          behavior: opts.smooth === false || prefersReducedMotion() ? "auto" : "smooth",
          block: "start",
        });
      });
    }
  }

  function toggleCommentsPanel(panel, options) {
    if (!panel) return;

    if (isCommentsPanelOpen(panel)) {
      closeCommentsPanel(panel, options);
      return;
    }

    openCommentsPanel(panel, options);
  }

  function initCommentTriggers(root) {
    var scope = root || document;
    scope.querySelectorAll("[data-thought-comment-trigger]").forEach(function (btn) {
      if (btn.dataset.commentBound === "1") return;
      btn.dataset.commentBound = "1";
      btn.setAttribute("aria-expanded", "false");

      btn.addEventListener("click", function (event) {
        event.preventDefault();
        var targetId = btn.getAttribute("data-target");
        toggleCommentsPanel(targetId ? document.getElementById(targetId) : null);
      });
    });
  }

  function openCommentsFromHash() {
    var hash = location.hash ? location.hash.slice(1) : "";
    if (!hash || hash.indexOf("thought-comments-") !== 0) return;

    openCommentsPanel(document.getElementById(hash), { smooth: false });
  }

  function markInstantCards(root) {
    root.querySelectorAll(".thought-card").forEach(function (card) {
      card.classList.add("thought-card--instant");
    });
  }

  function initEntry() {
    var page = document.querySelector("[data-thoughts]");
    if (!page) return;

    if (prefersReducedMotion()) {
      page.classList.add("is-visible");
      return;
    }

    requestAnimationFrame(function () {
      page.classList.add("is-visible");
    });
  }

  function initLoadMore() {
    if (loadInitialized) return;
    loadInitialized = true;

    var feed = document.getElementById("thoughts-feed");
    var loadWrap = document.getElementById("thoughts-load");
    var sentinel = document.getElementById("thoughts-sentinel");
    var loadingEl = document.getElementById("thoughts-loading");
    var endEl = document.getElementById("thoughts-end");
    var chunks = loadWrap ? Array.prototype.slice.call(loadWrap.querySelectorAll("template.thoughts-chunk")) : [];

    if (!feed || !loadWrap || !chunks.length) {
      if (endEl && (!loadWrap || !chunks.length)) endEl.hidden = false;
      return;
    }

    var cursor = 0;
    var busy = false;
    var done = false;
    var observer = null;

    function showEnd() {
      done = true;
      if (loadingEl) loadingEl.hidden = true;
      if (endEl) endEl.hidden = false;
      observer?.disconnect();
    }

    function loadMore() {
      if (busy || done) return;

      if (cursor >= chunks.length) {
        showEnd();
        return;
      }

      busy = true;
      if (loadingEl) loadingEl.hidden = false;

      var tpl = chunks[cursor];
      cursor += 1;
      var fragment = tpl.content.cloneNode(true);
      markInstantCards(fragment);
      feed.appendChild(fragment);
      initRelativeTimes(feed);
      initPostProse(feed);
      initCommentTriggers(feed);

      busy = false;
      if (loadingEl) loadingEl.hidden = true;

      if (cursor >= chunks.length) showEnd();
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
  }

  function init() {
    initEntry();
    initRelativeTimes();
    initCommentTriggers();
    initLoadMore();
    openCommentsFromHash();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
