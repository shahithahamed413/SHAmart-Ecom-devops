/* =============================================================
   toast.js — Accessible toast notifications
   ============================================================= */
(function (global) {
  "use strict";
  var Base = (global.SHAMart = global.SHAMart || {});

  var ICONS = { success: "✓", error: "✕", warn: "!", info: "i" };

  function container() {
    return document.getElementById("toasts");
  }

  function dismiss(el) {
    if (!el || el.classList.contains("is-leaving")) return;
    el.classList.add("is-leaving");
    el.addEventListener("animationend", function () { el.remove(); }, { once: true });
    setTimeout(function () { if (el.parentNode) el.remove(); }, 400);
  }

  function show(opts) {
    opts = opts || {};
    var type = opts.type || "info";
    var host = container();
    if (!host) return function () {};

    var el = document.createElement("div");
    el.className = "toast toast--" + type;
    el.setAttribute("role", type === "error" ? "alert" : "status");

    var icon = document.createElement("span");
    icon.className = "toast__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = ICONS[type] || ICONS.info;

    var body = document.createElement("div");
    body.className = "toast__body";
    if (opts.title) {
      var t = document.createElement("p");
      t.className = "toast__title";
      t.textContent = opts.title;
      body.appendChild(t);
    }
    if (opts.message) {
      var m = document.createElement("p");
      m.className = "toast__msg";
      m.textContent = opts.message;
      body.appendChild(m);
    }

    var close = document.createElement("button");
    close.type = "button";
    close.className = "toast__close";
    close.setAttribute("aria-label", "Dismiss notification");
    close.textContent = "\u00d7";
    close.addEventListener("click", function () { dismiss(el); });

    el.appendChild(icon);
    el.appendChild(body);
    el.appendChild(close);
    host.appendChild(el);

    var timeout = opts.duration !== undefined ? opts.duration : 4200;
    if (timeout > 0) setTimeout(function () { dismiss(el); }, timeout);

    return function () { dismiss(el); };
  }

  Base.toast = {
    show: show,
    success: function (title, message) { return show({ type: "success", title: title, message: message }); },
    error: function (title, message) { return show({ type: "error", title: title, message: message, duration: 6000 }); },
    warn: function (title, message) { return show({ type: "warn", title: title, message: message, duration: 5200 }); },
    info: function (title, message) { return show({ type: "info", title: title, message: message }); },
    dismissAll: function () {
      var host = container();
      if (host) { Array.prototype.forEach.call(host.children, dismiss); }
    }
  };
})(window);
