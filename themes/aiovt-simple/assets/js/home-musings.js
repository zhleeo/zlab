(function () {
  "use strict";

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

  function initRelativeTimes() {
    document.querySelectorAll("[data-home-musings] [data-relative-time]").forEach(function (el) {
      var item = el.closest("[data-date]");
      var raw = item ? item.getAttribute("data-date") : el.getAttribute("datetime");
      if (!raw) return;
      var date = new Date(raw);
      if (isNaN(date.getTime())) return;
      el.textContent = formatRelative(date);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initRelativeTimes);
  } else {
    initRelativeTimes();
  }
})();
