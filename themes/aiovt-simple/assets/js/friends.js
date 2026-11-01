import { initTwikooReplyCollapse } from "./twikoo-replies.js";

(function () {
  "use strict";

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function shuffleGrid(grid) {
    var cards = Array.prototype.slice.call(
      grid.querySelectorAll(".friend-card:not([data-pin-last])")
    );
    if (cards.length < 2) return;

    for (var i = cards.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = cards[i];
      cards[i] = cards[j];
      cards[j] = temp;
    }

    cards.forEach(function (card) {
      grid.appendChild(card);
    });

    grid.querySelectorAll(".friend-card[data-pin-last]").forEach(function (card) {
      grid.appendChild(card);
    });
  }

  function whenTwikooReady(fn) {
    if (typeof twikoo !== "undefined") {
      fn();
      return;
    }

    var tries = 0;
    var timer = window.setInterval(function () {
      if (typeof twikoo !== "undefined") {
        window.clearInterval(timer);
        fn();
      } else if (++tries > 60) {
        window.clearInterval(timer);
      }
    }, 50);
  }

  function initTwikoo(page) {
    var host = page.querySelector("#friends-twikoo-root");
    var mount = page.querySelector("#friends-twikoo");
    if (!host || !mount) return;

    var envId = host.getAttribute("data-twikoo-env");
    if (!envId || typeof twikoo === "undefined") return;

    twikoo.init({
      envId: envId,
      el: "#friends-twikoo",
      path: host.getAttribute("data-twikoo-path") || location.pathname,
      lang: host.getAttribute("data-twikoo-lang") || "zh-CN",
      onCommentLoaded: function () {
        host.classList.add("is-ready");
        initTwikooReplyCollapse(host);
      },
    });
  }

  function initEntry() {
    var page = document.querySelector("[data-friends]");
    if (!page) return;

    page.querySelectorAll("[data-friends-grid]").forEach(shuffleGrid);

    whenTwikooReady(function () {
      initTwikoo(page);
    });

    if (prefersReducedMotion()) {
      page.classList.add("is-visible");
      return;
    }

    requestAnimationFrame(function () {
      page.classList.add("is-visible");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEntry);
  } else {
    initEntry();
  }
})();
