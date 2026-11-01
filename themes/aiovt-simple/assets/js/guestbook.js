import { initTwikooReplyCollapse } from "./twikoo-replies.js";

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

  function initTwikoo(root) {
    var host = root.querySelector("#guestbook-twikoo-root");
    var mount = root.querySelector("#twikoo");
    if (!host || !mount) return;

    var envId = host.getAttribute("data-twikoo-env");
    if (!envId || typeof twikoo === "undefined") return;

    twikoo.init({
      envId: envId,
      el: "#twikoo",
      path: host.getAttribute("data-twikoo-path") || location.pathname,
      lang: host.getAttribute("data-twikoo-lang") || "zh-CN",
      onCommentLoaded: function () {
        host.classList.add("is-ready");
        initTwikooReplyCollapse(host);
      },
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

  function initForm(root) {
    var form = root.querySelector("[data-guestbook-form]");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var mailto = form.getAttribute("data-mailto") || "";
      var name = (form.querySelector('[name="name"]') || {}).value || "";
      var email = (form.querySelector('[name="email"]') || {}).value || "";
      var message = (form.querySelector('[name="message"]') || {}).value || "";

      if (mailto.indexOf("mailto:") === 0) {
        mailto = mailto.slice(7);
      }

      if (mailto) {
        var body = message.trim();
        if (email.trim()) {
          body += "\n\n—— " + name.trim() + " (" + email.trim() + ")";
        } else {
          body += "\n\n—— " + name.trim();
        }
        var href =
          "mailto:" +
          encodeURIComponent(mailto) +
          "?subject=" +
          encodeURIComponent("留言：" + name.trim()) +
          "&body=" +
          encodeURIComponent(body);
        window.location.href = href;
        return;
      }

      window.alert("留言已记录，感谢你的来访。");
      form.reset();
    });
  }

  function initEntry() {
    var page = document.querySelector("[data-guestbook]");
    if (!page) return;

    initRelativeTimes(page);
    whenTwikooReady(function () {
      initTwikoo(page);
    });
    initForm(page);

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
