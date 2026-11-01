import { initTwikooReplyCollapse } from "./twikoo-replies.js";

(function () {
  "use strict";

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function initEntryAnimation() {
    var post = document.querySelector(".post");
    if (!post) return;

    var fromOrbit = false;
    try {
      fromOrbit = sessionStorage.getItem("post-nav-from-orbit") === "1";
      if (fromOrbit) sessionStorage.removeItem("post-nav-from-orbit");
    } catch (e) {
      fromOrbit = false;
    }

    if (fromOrbit) {
      post.classList.add("post--from-orbit");
      document.body.classList.add("is-post-from-orbit");
    }

    if (prefersReducedMotion() || window.matchMedia("(max-width: 767px)").matches) {
      post.classList.add("is-visible");
      return;
    }

    var delay = fromOrbit ? 80 : 0;
    window.setTimeout(function () {
      requestAnimationFrame(function () {
        post.classList.add("is-visible");
      });
    }, delay);
  }

  function initLazyImages() {
    document.querySelectorAll(".post-figure img, .post-cover__img").forEach(function (img) {
      if (img.complete && img.naturalWidth > 0) {
        img.classList.add("is-loaded");
        return;
      }

      img.addEventListener("load", function () {
        img.classList.add("is-loaded");
      });

      img.addEventListener("error", function () {
        img.classList.add("is-loaded");
      });
    });
  }

  function countCodeLines(pre) {
    var lines = pre.querySelectorAll(".line");
    if (lines.length) return lines.length;

    var text = pre.innerText || pre.textContent || "";
    if (!text) return 0;
    return text.replace(/\n$/, "").split("\n").length;
  }

  function initCodeCollapse(root) {
    var threshold = 10;
    var scope = root || document;

    scope.querySelectorAll(".post-code").forEach(function (block) {
      if (block.dataset.collapseBound === "1") return;

      var pre = block.querySelector("pre");
      var toggle = block.querySelector(".post-code__toggle");
      if (!pre || !toggle) return;

      var lineCount = countCodeLines(pre);
      if (lineCount <= threshold) return;

      block.dataset.collapseBound = "1";
      block.classList.add("post-code--collapsible", "post-code--collapsed");
      toggle.hidden = false;
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "展开代码");

      toggle.addEventListener("click", function () {
        var collapsed = block.classList.toggle("post-code--collapsed");
        block.classList.toggle("post-code--expanded", !collapsed);
        toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
        toggle.setAttribute("aria-label", collapsed ? "展开代码" : "收起代码");
      });
    });
  }

  function initCodeCopy(root) {
    var scope = root || document;

    scope.querySelectorAll(".post-code").forEach(function (block) {
      if (block.dataset.copyBound === "1") return;
      block.dataset.copyBound = "1";

      var btn = block.querySelector(".post-code__copy");
      var pre = block.querySelector("pre");
      if (!btn || !pre) return;

      btn.addEventListener("click", function () {
        var text = pre.innerText || pre.textContent || "";
        if (!text) return;

        var done = function () {
          btn.classList.add("is-copied");
          btn.setAttribute("aria-label", "已复制");
          window.setTimeout(function () {
            btn.classList.remove("is-copied");
            btn.setAttribute("aria-label", "复制代码");
          }, 1800);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(function () {
            fallbackCopy(text, done);
          });
        } else {
          fallbackCopy(text, done);
        }
      });
    });
  }

  function fallbackCopy(text, callback) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      callback();
    } catch (e) {
      /* ignore */
    }
    document.body.removeChild(ta);
  }

  function processFigureGrids(body) {
    if (!body || body.dataset.figureGrids === "true") return;
    body.dataset.figureGrids = "true";

    var child = body.firstElementChild;
    while (child) {
      if (!child.classList.contains("post-figure")) {
        child = child.nextElementSibling;
        continue;
      }

      var group = [];
      while (child && child.classList.contains("post-figure")) {
        group.push(child);
        child = child.nextElementSibling;
      }

      if (group.length >= 2) {
        var grid = document.createElement("div");
        grid.className = "post-figure-grid";
        if (group.length % 2 === 1) {
          grid.classList.add("post-figure-grid--odd");
        }
        group[0].parentNode.insertBefore(grid, group[0]);
        group.forEach(function (fig) {
          grid.appendChild(fig);
        });
      }
    }
  }

  function initFigureGrids(root) {
    var scope = root || document;
    scope.querySelectorAll(".post-body").forEach(processFigureGrids);
  }

  var imageLightbox = null;

  var LIGHTBOX_IMG_SELECTORS =
    ".post-body .post-figure img, .thought-gallery__item img, .thought-media__cover img";

  function getLightboxGroup(img) {
    var card = img.closest(".thought-card");
    if (card) {
      return "thought:" + (card.id || card.getAttribute("data-date") || "card");
    }

    var post = img.closest(".post");
    if (post) {
      return "post:" + (post.id || "article");
    }

    return "default";
  }

  function collectLightboxCandidates(scope) {
    var results = [];

    (scope || document).querySelectorAll(LIGHTBOX_IMG_SELECTORS).forEach(function (img) {
      if (img.dataset.lightboxBound === "1") return;
      if (!img.getAttribute("src")) return;

      var caption = "";
      var figure = img.closest(".post-figure");
      if (figure) {
        var captionEl = figure.querySelector(".post-figure__caption");
        caption = captionEl ? captionEl.textContent.trim() : "";
      } else {
        caption = (img.getAttribute("alt") || "").trim();
      }

      img.dataset.lightboxBound = "1";
      results.push({
        img: img,
        src: img.currentSrc || img.src,
        alt: img.getAttribute("alt") || "",
        caption: caption,
        groupKey: getLightboxGroup(img),
      });
    });

    return results;
  }

  function initImageLightbox(root) {
    var candidates = collectLightboxCandidates(root || document);
    if (!candidates.length && !imageLightbox) return;

    if (imageLightbox) {
      imageLightbox.addItems(candidates);
      return;
    }

    if (!candidates.length) return;

    var items = [];

    var lightbox = document.createElement("div");
    lightbox.className = "post-lightbox";
    lightbox.id = "post-lightbox";
    lightbox.hidden = true;
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.setAttribute("aria-label", "图片预览");
    lightbox.innerHTML =
      '<div class="post-lightbox__backdrop" data-lightbox-close></div>' +
      '<div class="post-lightbox__panel">' +
      '<header class="post-lightbox__toolbar">' +
      '<span class="post-lightbox__counter"></span>' +
      '<div class="post-lightbox__tools">' +
      '<button type="button" class="post-lightbox__tool post-lightbox__zoom-out" aria-label="缩小">−</button>' +
      '<button type="button" class="post-lightbox__tool post-lightbox__zoom-in" aria-label="放大">+</button>' +
      '<button type="button" class="post-lightbox__close" aria-label="关闭">×</button>' +
      "</div></header>" +
      '<div class="post-lightbox__stage">' +
      '<button type="button" class="post-lightbox__nav post-lightbox__nav--prev" aria-label="上一张">‹</button>' +
      '<div class="post-lightbox__viewport">' +
      '<img class="post-lightbox__img" alt="" draggable="false">' +
      "</div>" +
      '<button type="button" class="post-lightbox__nav post-lightbox__nav--next" aria-label="下一张">›</button>' +
      "</div>" +
      '<p class="post-lightbox__caption"></p>' +
      '<div class="post-lightbox__filmstrip" role="tablist" aria-label="图片列表">' +
      '<div class="post-lightbox__filmstrip-track"></div></div>' +
      "</div>";
    document.body.appendChild(lightbox);

    var backdrop = lightbox.querySelector(".post-lightbox__backdrop");
    var counter = lightbox.querySelector(".post-lightbox__counter");
    var zoomInBtn = lightbox.querySelector(".post-lightbox__zoom-in");
    var zoomOutBtn = lightbox.querySelector(".post-lightbox__zoom-out");
    var closeBtn = lightbox.querySelector(".post-lightbox__close");
    var prevBtn = lightbox.querySelector(".post-lightbox__nav--prev");
    var nextBtn = lightbox.querySelector(".post-lightbox__nav--next");
    var stage = lightbox.querySelector(".post-lightbox__stage");
    var viewport = lightbox.querySelector(".post-lightbox__viewport");
    var previewImg = lightbox.querySelector(".post-lightbox__img");
    var caption = lightbox.querySelector(".post-lightbox__caption");
    var filmstrip = lightbox.querySelector(".post-lightbox__filmstrip");
    var filmstripTrack = lightbox.querySelector(".post-lightbox__filmstrip-track");

    var currentIndex = 0;
    var activeGroup = null;
    var scale = 1;
    var translateX = 0;
    var translateY = 0;
    var isDragging = false;
    var isSwiping = false;
    var dragStartX = 0;
    var dragStartY = 0;
    var dragOriginX = 0;
    var dragOriginY = 0;
    var swipeOffsetX = 0;
    var didDrag = false;
    var isPinching = false;
    var pinchStartScale = 1;
    var pinchStartTX = 0;
    var pinchStartTY = 0;
    var pinchStartDist = 0;
    var pinchStartCenter = { x: 0, y: 0 };
    var activePointers = new Map();
    var lastFocused = null;

    function getActivePointerList() {
      return Array.from(activePointers.values());
    }

    function getPointerDistance(a, b) {
      return Math.hypot(b.x - a.x, b.y - a.y);
    }

    function getPointerCenter(a, b) {
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    function resetPointerState() {
      activePointers.clear();
      isPinching = false;
      isSwiping = false;
      isDragging = false;
      swipeOffsetX = 0;
      pinchStartDist = 0;
      viewport.classList.remove("is-dragging");
    }

    function getGroupItems() {
      if (!activeGroup) return items;
      return items.filter(function (entry) {
        return entry.groupKey === activeGroup;
      });
    }

    function bindItem(item, globalIndex) {
      item.img.classList.add("is-previewable");
      item.img.setAttribute("tabindex", "0");
      item.img.setAttribute("role", "button");
      item.img.setAttribute("aria-label", "预览图片 " + (globalIndex + 1));

      var thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "post-lightbox__thumb";
      thumb.setAttribute("role", "tab");
      thumb.setAttribute("aria-label", "查看第 " + (globalIndex + 1) + " 张图片");
      var thumbImg = document.createElement("img");
      thumbImg.src = item.src;
      thumbImg.alt = "";
      thumbImg.loading = "lazy";
      thumbImg.decoding = "async";
      thumb.appendChild(thumbImg);
      thumb.addEventListener("click", function () {
        open(globalIndex);
      });
      filmstripTrack.appendChild(thumb);
      item.thumb = thumb;

      item.img.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        open(globalIndex);
      });
      item.img.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open(globalIndex);
        }
      });
    }

    function addItems(newItems) {
      if (!newItems.length) return;
      var startIndex = items.length;
      newItems.forEach(function (item, offset) {
        bindItem(item, startIndex + offset);
        items.push(item);
      });
    }

    function centerActiveThumb(smooth) {
      var groupItems = getGroupItems();
      var item = groupItems[currentIndex];
      var thumb = item ? item.thumb : null;
      if (!thumb || !filmstrip) return;

      var maxScroll = Math.max(0, filmstrip.scrollWidth - filmstrip.clientWidth);
      var target = thumb.offsetLeft - (filmstrip.clientWidth - thumb.offsetWidth) / 2;
      target = Math.max(0, Math.min(target, maxScroll));

      if (smooth && !prefersReducedMotion() && filmstrip.scrollTo) {
        filmstrip.scrollTo({ left: target, behavior: "smooth" });
      } else {
        filmstrip.scrollLeft = target;
      }
    }

    function applyTransform() {
      var tx = translateX;
      var ty = translateY;

      if (isSwiping && scale <= 1.01) {
        tx = swipeOffsetX;
        ty = 0;
        var groupItems = getGroupItems();
        if (currentIndex === 0 && tx > 0) tx *= 0.35;
        if (currentIndex === groupItems.length - 1 && tx < 0) tx *= 0.35;
      }

      previewImg.style.transform =
        "translate(" + tx + "px, " + ty + "px) scale(" + scale + ")";
      viewport.classList.toggle("is-zoomed", scale > 1.01);
    }

    function getSwipeThreshold() {
      return Math.min(56, Math.max(40, window.innerWidth * 0.12));
    }

    function releaseStageCapture(event) {
      if (stage.releasePointerCapture && event.pointerId != null) {
        try {
          stage.releasePointerCapture(event.pointerId);
        } catch (e) {
          /* ignore */
        }
      }
    }

    function resetZoom() {
      scale = 1;
      translateX = 0;
      translateY = 0;
      applyTransform();
    }

    function clampScale(next) {
      return Math.min(4, Math.max(1, next));
    }

    function setZoom(next, originX, originY) {
      var prev = scale;
      scale = clampScale(next);
      if (scale === 1) {
        translateX = 0;
        translateY = 0;
      } else if (typeof originX === "number" && typeof originY === "number" && prev !== scale) {
        var rect = previewImg.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        translateX += (originX - cx) * (scale / prev - 1);
        translateY += (originY - cy) * (scale / prev - 1);
      }
      applyTransform();
    }

    function render() {
      var groupItems = getGroupItems();
      if (!groupItems.length) return;

      var item = groupItems[currentIndex];
      previewImg.src = item.src;
      previewImg.alt = item.alt;
      caption.textContent = item.caption;
      counter.textContent = currentIndex + 1 + " / " + groupItems.length;
      prevBtn.disabled = currentIndex === 0;
      nextBtn.disabled = currentIndex === groupItems.length - 1;
      filmstrip.hidden = groupItems.length <= 1;

      items.forEach(function (entry) {
        var inGroup = !activeGroup || entry.groupKey === activeGroup;
        entry.thumb.hidden = !inGroup;
        var active = inGroup && entry === groupItems[currentIndex];
        entry.thumb.classList.toggle("is-active", active);
        entry.thumb.setAttribute("aria-selected", active ? "true" : "false");
      });

      requestAnimationFrame(function () {
        centerActiveThumb(true);
      });

      resetZoom();
    }

    function open(globalIndex) {
      if (globalIndex < 0 || globalIndex >= items.length) return;
      activeGroup = items[globalIndex].groupKey;
      var groupItems = getGroupItems();
      currentIndex = groupItems.indexOf(items[globalIndex]);
      if (currentIndex < 0) currentIndex = 0;
      lastFocused = document.activeElement;
      render();
      lightbox.hidden = false;
      document.body.classList.add("is-lightbox-open");
      closeBtn.focus();
      requestAnimationFrame(function () {
        centerActiveThumb(false);
      });
    }

    function close() {
      resetPointerState();
      lightbox.hidden = true;
      document.body.classList.remove("is-lightbox-open");
      resetZoom();
      if (lastFocused && lastFocused.focus) {
        lastFocused.focus();
      }
    }

    function showRelative(step) {
      var groupItems = getGroupItems();
      var next = currentIndex + step;
      if (next < 0 || next >= groupItems.length) return;
      currentIndex = next;
      render();
    }

    function shouldIgnoreCloseClick(target) {
      return target.closest(
        ".post-lightbox__img, .post-lightbox__tool, .post-lightbox__close, .post-lightbox__nav, .post-lightbox__thumb"
      );
    }

    backdrop.addEventListener("click", close);
    lightbox.addEventListener("click", function (event) {
      if (lightbox.hidden || didDrag) {
        didDrag = false;
        return;
      }
      if (shouldIgnoreCloseClick(event.target)) return;
      close();
    });
    closeBtn.addEventListener("click", close);
    prevBtn.addEventListener("click", function () {
      showRelative(-1);
    });
    nextBtn.addEventListener("click", function () {
      showRelative(1);
    });
    zoomInBtn.addEventListener("click", function () {
      setZoom(scale + 0.35);
    });
    zoomOutBtn.addEventListener("click", function () {
      setZoom(scale - 0.35);
    });

    viewport.addEventListener(
      "wheel",
      function (event) {
        event.preventDefault();
        var delta = event.deltaY > 0 ? -0.12 : 0.12;
        setZoom(scale + delta, event.clientX, event.clientY);
      },
      { passive: false }
    );

    previewImg.addEventListener("dblclick", function (event) {
      if (scale > 1.01) {
        resetZoom();
      } else {
        setZoom(2.2, event.clientX, event.clientY);
      }
    });

    stage.addEventListener("pointerdown", function (event) {
      if (event.target.closest(".post-lightbox__nav")) return;

      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (activePointers.size === 2) {
        isSwiping = false;
        isDragging = false;
        swipeOffsetX = 0;
        isPinching = true;
        didDrag = true;

        var pts = getActivePointerList();
        pinchStartScale = scale;
        pinchStartTX = translateX;
        pinchStartTY = translateY;
        pinchStartDist = getPointerDistance(pts[0], pts[1]) || 1;
        pinchStartCenter = getPointerCenter(pts[0], pts[1]);
        viewport.classList.add("is-dragging");

        if (stage.setPointerCapture) {
          stage.setPointerCapture(event.pointerId);
        }
        return;
      }

      if (activePointers.size > 2) return;
      if (event.button !== 0 && event.pointerType !== "touch") return;

      didDrag = false;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      swipeOffsetX = 0;

      if (scale <= 1.01 && getGroupItems().length > 1) {
        isSwiping = true;
        if (stage.setPointerCapture) {
          stage.setPointerCapture(event.pointerId);
        }
        return;
      }

      if (scale <= 1.01) return;

      isDragging = true;
      dragOriginX = translateX;
      dragOriginY = translateY;
      viewport.classList.add("is-dragging");
      if (stage.setPointerCapture) {
        stage.setPointerCapture(event.pointerId);
      }
    });

    stage.addEventListener(
      "pointermove",
      function (event) {
        if (!activePointers.has(event.pointerId)) return;
        activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (isPinching && activePointers.size >= 2) {
          event.preventDefault();
          var pinchPts = getActivePointerList();
          if (pinchPts.length < 2 || pinchStartDist <= 0) return;

          var dist = getPointerDistance(pinchPts[0], pinchPts[1]);
          var center = getPointerCenter(pinchPts[0], pinchPts[1]);
          var nextScale = clampScale(pinchStartScale * (dist / pinchStartDist));
          var dx = center.x - pinchStartCenter.x;
          var dy = center.y - pinchStartCenter.y;

          scale = nextScale;
          translateX = pinchStartTX + dx - (dx * nextScale) / pinchStartScale;
          translateY = pinchStartTY + dy - (dy * nextScale) / pinchStartScale;

          if (scale <= 1.01) {
            scale = 1;
            translateX = 0;
            translateY = 0;
          }

          didDrag = true;
          applyTransform();
          return;
        }

        if (isSwiping) {
          swipeOffsetX = event.clientX - dragStartX;
          if (
            Math.abs(swipeOffsetX) > 4 ||
            Math.abs(event.clientY - dragStartY) > 4
          ) {
            didDrag = true;
          }
          applyTransform();
          return;
        }

        if (!isDragging) return;

        if (
          Math.abs(event.clientX - dragStartX) > 4 ||
          Math.abs(event.clientY - dragStartY) > 4
        ) {
          didDrag = true;
        }
        translateX = dragOriginX + (event.clientX - dragStartX);
        translateY = dragOriginY + (event.clientY - dragStartY);
        applyTransform();
      },
      { passive: false }
    );

    function finishStagePointer(event) {
      activePointers.delete(event.pointerId);

      if (isPinching) {
        if (activePointers.size >= 2) return;

        isPinching = false;
        pinchStartDist = 0;
        viewport.classList.remove("is-dragging");

        if (scale <= 1.01) {
          scale = 1;
          translateX = 0;
          translateY = 0;
          applyTransform();
        } else if (activePointers.size === 1) {
          var remaining = getActivePointerList()[0];
          isDragging = true;
          dragOriginX = translateX;
          dragOriginY = translateY;
          dragStartX = remaining.x;
          dragStartY = remaining.y;
        }

        releaseStageCapture(event);
        return;
      }

      if (activePointers.size > 0) return;

      if (isSwiping) {
        var dx = event.clientX - dragStartX;
        var dy = event.clientY - dragStartY;
        var threshold = getSwipeThreshold();
        isSwiping = false;
        swipeOffsetX = 0;
        releaseStageCapture(event);

        if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.15 && scale <= 1.01) {
          if (dx < 0) showRelative(1);
          else showRelative(-1);
          didDrag = true;
          return;
        }

        applyTransform();
        return;
      }

      if (!isDragging) {
        releaseStageCapture(event);
        return;
      }

      isDragging = false;
      viewport.classList.remove("is-dragging");
      releaseStageCapture(event);
    }

    stage.addEventListener("pointerup", finishStagePointer);
    stage.addEventListener("pointercancel", finishStagePointer);

    document.addEventListener("keydown", function (event) {
      if (lightbox.hidden) return;

      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showRelative(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        showRelative(1);
      }
    });

    window.addEventListener("resize", function () {
      if (lightbox.hidden) return;
      centerActiveThumb(false);
    });

    imageLightbox = { addItems: addItems };
    addItems(candidates);
  }

  function initPostTwikoo() {
    var host = document.querySelector("#post-twikoo-root");
    if (!host) return;

    var envId = host.getAttribute("data-twikoo-env");
    if (!envId || typeof twikoo === "undefined") return;

    twikoo.init({
      envId: envId,
      el: "#post-twikoo",
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

  function initPostProse(root, options) {
    var opts = options || {};
    initFigureGrids(root);
    initLazyImages(root);
    initCodeCollapse(root);
    initCodeCopy(root);

    if (opts.lightbox !== false) {
      initImageLightbox(root);
    }
  }

  function init() {
    initEntryAnimation();
    initPostProse(document);
    whenTwikooReady(initPostTwikoo);
  }

  document.addEventListener("post-prose:init", function (event) {
    var detail = event.detail || {};
    initPostProse(detail.root || document, { lightbox: detail.lightbox });
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
