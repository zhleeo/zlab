import { initTwikooReplyCollapse } from "./twikoo-replies.js";

(function () {
  "use strict";

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

  function initTwikoo() {
    var host = document.querySelector("#about-twikoo-root");
    var mount = document.querySelector("#about-twikoo");
    if (!host || !mount) return;

    var envId = host.getAttribute("data-twikoo-env");
    if (!envId || typeof twikoo === "undefined") return;

    twikoo.init({
      envId: envId,
      el: "#about-twikoo",
      path: host.getAttribute("data-twikoo-path") || location.pathname,
      lang: host.getAttribute("data-twikoo-lang") || "zh-CN",
      onCommentLoaded: function () {
        host.classList.add("is-ready");
        initTwikooReplyCollapse(host);
      },
    });
  }

  function init() {
    if (!document.body.classList.contains("is-about")) return;

    whenTwikooReady(initTwikoo);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
