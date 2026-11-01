/**
 * Twikoo reply-thread collapse: default collapsed, single-click toggle.
 */

export function initTwikooReplyCollapse(root) {
  if (!root) return;

  var MOBILE_MQ = window.matchMedia("(max-width: 767px)");

  function countReplies(repliesEl) {
    return repliesEl.querySelectorAll(":scope > .tk-comment").length;
  }

  function isNativeExpandWrap(node) {
    return (
      node &&
      (node.classList.contains("tk-expand-wrap") ||
        node.classList.contains("tk-collapse-wrap")) &&
      !node.classList.contains("tk-replies-toggle-wrap")
    );
  }

  function walkReplyControls(repliesEl) {
    var toggles = [];
    var natives = [];
    var node = repliesEl.nextElementSibling;

    while (node) {
      if (node.classList.contains("tk-replies-toggle-wrap")) {
        var toggleBtn = node.querySelector(".tk-replies-toggle");
        if (toggleBtn) toggles.push(toggleBtn);
        node = node.nextElementSibling;
        continue;
      }

      if (node.classList.contains("tk-replies-toggle")) {
        toggles.push(node);
        node = node.nextElementSibling;
        continue;
      }

      if (isNativeExpandWrap(node)) {
        natives.push(node);
        node = node.nextElementSibling;
        continue;
      }

      if (
        node.classList.contains("tk-expand") &&
        !node.classList.contains("tk-replies-toggle")
      ) {
        natives.push(node);
        node = node.nextElementSibling;
        continue;
      }

      break;
    }

    return { toggles: toggles, natives: natives };
  }

  function hideNode(node) {
    node.hidden = true;
    node.style.display = "none";
    node.style.pointerEvents = "none";
    node.setAttribute("aria-hidden", "true");
    node.classList.add("tk-replies-native-expand");
    node.tabIndex = -1;
  }

  function hideNativeReplyExpand(natives) {
    natives.forEach(hideNode);
  }

  function createToggleWrap(repliesEl) {
    var wrap = document.createElement("div");
    wrap.className = "tk-expand-wrap tk-replies-toggle-wrap";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tk-replies-toggle";
    wrap.appendChild(btn);

    repliesEl.insertAdjacentElement("afterend", wrap);
    return btn;
  }

  function updateLabel(btn, repliesEl, count) {
    var open = repliesEl.classList.contains("tk-replies-expand");
    btn.textContent = open ? "收起回复" : "展开 " + count + " 条回复";
    btn.setAttribute("aria-expanded", open ? "true" : "false");

    var wrap = btn.closest(".tk-replies-toggle-wrap");
    if (wrap) {
      wrap.hidden = false;
      wrap.style.display = "";
      wrap.removeAttribute("aria-hidden");
    }

    btn.hidden = false;
    btn.style.display = "";
    btn.removeAttribute("aria-hidden");
  }

  function setCollapsed(repliesEl, collapsed) {
    if (collapsed) {
      repliesEl.classList.remove("tk-replies-expand");
      repliesEl.dataset.tkRepliesCollapsed = "true";
      return;
    }

    repliesEl.classList.add("tk-replies-expand");
    delete repliesEl.dataset.tkRepliesCollapsed;
  }

  function toggleReplies(repliesEl, btn) {
    var count = countReplies(repliesEl);
    var open = repliesEl.classList.contains("tk-replies-expand");
    setCollapsed(repliesEl, open);
    updateLabel(btn, repliesEl, count);
  }

  function bindToggle(repliesEl, btn) {
    if (btn.dataset.tkReplyBound) return;

    btn.dataset.tkReplyBound = "1";

    if (btn.classList.contains("tk-expand")) {
      btn.classList.remove("tk-expand");
    }

    var touchHandledAt = 0;

    function stopEvent(e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }

    btn.addEventListener(
      "touchend",
      function (e) {
        stopEvent(e);
        touchHandledAt = Date.now();
        toggleReplies(repliesEl, btn);
      },
      { capture: true, passive: false }
    );

    btn.addEventListener(
      "click",
      function (e) {
        if (Date.now() - touchHandledAt < 500) {
          stopEvent(e);
          return;
        }

        stopEvent(e);
        toggleReplies(repliesEl, btn);
      },
      true
    );
  }

  function resolveToggle(repliesEl, controls) {
    hideNativeReplyExpand(controls.natives);

    var btn = controls.toggles[0] || null;

    if (controls.toggles.length > 1) {
      controls.toggles.slice(1).forEach(function (node) {
        var wrap = node.closest(".tk-replies-toggle-wrap");
        if (wrap && wrap !== btn.closest(".tk-replies-toggle-wrap")) {
          wrap.remove();
        } else if (node !== btn) {
          node.remove();
        }
      });
    }

    if (!btn) {
      btn = createToggleWrap(repliesEl);
    } else if (!btn.closest(".tk-replies-toggle-wrap")) {
      var shell = document.createElement("div");
      shell.className = "tk-expand-wrap tk-replies-toggle-wrap";
      btn.parentNode.insertBefore(shell, btn);
      shell.appendChild(btn);
    }

    if (!btn.classList.contains("tk-replies-toggle")) {
      btn.classList.add("tk-replies-toggle");
    }

    return btn;
  }

  function trimExtraContentExpand(mainEl) {
    if (!MOBILE_MQ.matches || !mainEl) return;

    var replies = mainEl.querySelector(":scope > .tk-replies");
    if (!replies || !countReplies(replies)) return;

    var content = mainEl.querySelector(":scope > .tk-content");
    if (!content) return;

    content.classList.add("tk-content-expand");

    var node = content.nextElementSibling;
    while (node && node !== replies) {
      if (isNativeExpandWrap(node) || node.classList.contains("tk-replies-native-expand")) {
        hideNode(node);
      }
      node = node.nextElementSibling;
    }
  }

  function setupReplies(repliesEl) {
    var count = countReplies(repliesEl);
    if (!count) return;

    if (!repliesEl.dataset.tkRepliesManaged) {
      repliesEl.dataset.tkRepliesManaged = "1";
      setCollapsed(repliesEl, true);
    } else if (repliesEl.dataset.tkRepliesCollapsed === "true") {
      repliesEl.classList.remove("tk-replies-expand");
    }

    var mainEl = repliesEl.closest(".tk-main");
    if (mainEl && repliesEl === mainEl.querySelector(":scope > .tk-replies")) {
      trimExtraContentExpand(mainEl);
    }

    var controls = walkReplyControls(repliesEl);
    var btn = resolveToggle(repliesEl, controls);
    bindToggle(repliesEl, btn);
    updateLabel(btn, repliesEl, count);
  }

  function scan() {
    root.querySelectorAll(".tk-replies").forEach(setupReplies);
  }

  scan();
  requestAnimationFrame(scan);

  var scheduled = false;
  var observer = new MutationObserver(function () {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      scan();
    });
  });

  observer.observe(root, { childList: true, subtree: true });

  window.setTimeout(scan, 150);
  window.setTimeout(scan, 500);
  window.setTimeout(scan, 1200);

  if (typeof MOBILE_MQ.addEventListener === "function") {
    MOBILE_MQ.addEventListener("change", scan);
  }

  return observer;
}
