(function () {
  "use strict";

  function initEntry() {
    document.querySelectorAll("[data-tag-term], [data-tags-index]").forEach(function (page) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        page.classList.add("is-visible");
        return;
      }
      requestAnimationFrame(function () {
        page.classList.add("is-visible");
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEntry);
  } else {
    initEntry();
  }
})();
