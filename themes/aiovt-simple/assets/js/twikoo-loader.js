var loadPromise = null;

function waitForTwikoo(maxTries, interval) {
  return new Promise(function (resolve, reject) {
    if (typeof twikoo !== "undefined") {
      resolve();
      return;
    }

    var tries = 0;
    var timer = window.setInterval(function () {
      if (typeof twikoo !== "undefined") {
        window.clearInterval(timer);
        resolve();
      } else if (++tries > (maxTries || 120)) {
        window.clearInterval(timer);
        reject(new Error("Twikoo load timeout"));
      }
    }, interval || 50);
  });
}

export function loadTwikooAssets(config) {
  if (typeof twikoo !== "undefined") {
    return Promise.resolve();
  }

  if (!config || !config.jsUrl) {
    return Promise.reject(new Error("Missing Twikoo config"));
  }

  if (loadPromise) return loadPromise;

  loadPromise = new Promise(function (resolve, reject) {
    if (config.cssUrl && !document.querySelector('link[data-twikoo-css="1"]')) {
      var css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = config.cssUrl;
      css.setAttribute("data-twikoo-css", "1");
      document.head.appendChild(css);
    }

    if (document.querySelector('script[data-twikoo-js="1"]')) {
      waitForTwikoo().then(resolve).catch(reject);
      return;
    }

    var script = document.createElement("script");
    script.src = config.jsUrl;
    script.defer = true;
    script.setAttribute("data-twikoo-js", "1");
    script.addEventListener("load", function () {
      waitForTwikoo().then(resolve).catch(reject);
    });
    script.addEventListener("error", function () {
      loadPromise = null;
      reject(new Error("Twikoo script failed"));
    });
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function whenTwikooReady(config, fn) {
  loadTwikooAssets(config)
    .then(fn)
    .catch(function () {
      /* ignore */
    });
}
