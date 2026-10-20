/* =============================================================
   ops.js — Embedded DevOps / Infrastructure console
   Polls /readyz, /version and /metrics; visualises DB health,
   build metadata, a chaos fault-injection switch and metrics.
   ============================================================= */
(function (global) {
  "use strict";
  var Base = (global.SHAMart = global.SHAMart || {});
  var api = Base.api;

  var POLL_MS = 10000;
  var timer = null;
  var hooks = {};
  var metricsSeries = [];

  function $(id) { return document.getElementById(id); }

  function setPill(state, text, latency) {
    var pill = $("ops-status-pill");
    var dot = pill.querySelector(".pill__dot");
    pill.className = "pill pill--" + state;
    $("ops-status-text").textContent = text;
    if (latency != null) $("ops-latency").textContent = latency + " ms";
  }

  function fmtTime(d) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function refreshHealth() {
    var started = (global.performance && performance.now) ? performance.now() : Date.now();
    return api.getReadyz().then(function (res) {
      var elapsed = Math.round(((global.performance && performance.now) ? performance.now() : Date.now()) - started);
      var data = res.data || {};
     var db = data.database || {};
     var connected = (db === "connected") || !!db.connected;

      $("ops-health-status").textContent = res.degraded
        ? (res.error && res.error.status === 503 && !api.state.chaos ? "503 · degraded" : "unreachable")
        : (data.status || "ok");
      $("ops-health-db").textContent = res.degraded
        ? "disconnected"
        : (connected ? "connected · aiomysql" : "disconnected");
      $("ops-health-latency").textContent = elapsed + " ms";
      $("ops-health-time").textContent = fmtTime(new Date());

      var badge = $("ops-health-badge");
      if (res.degraded) {
        badge.className = "badge badge--danger";
        badge.textContent = "degraded";
        setPill("error", api.state.chaos ? "Fault injected (503)" : "Backend offline", elapsed);
      } else if (connected) {
        badge.className = "badge badge--success";
        badge.textContent = "healthy";
        setPill("ok", "Operational", elapsed);
      } else {
        badge.className = "badge badge--warn";
        badge.textContent = "db down";
        setPill("warn", "DB unreachable", elapsed);
      }

      if (hooks.onStatus) hooks.onStatus({ degraded: res.degraded, latency: elapsed, data: data });
      return res;
    });
  }

  function refreshVersion() {
    return api.getVersion().then(function (res) {
      var v = res.data || {};
      $("ops-version-sha").textContent = v.shortSha || (v.gitCommit || "—").slice(0, 8);
      $("ops-version-sha").title = v.gitCommit || "";
      $("ops-version-tag").textContent = v.containerTag || "—";
      $("ops-version-env-full").textContent = v.environment || "—";
      $("ops-version-api").textContent = v.apiVersion || "v1";
      $("ops-version-source").textContent = res.source === "live" ? "live backend" : "mock fallback";
      var envBadge = $("ops-version-env");
      envBadge.textContent = (v.environment || "unknown").split("-")[0];
    }).catch(function () { /* telemetry must never crash the UI */ });
  }

  function fmtUptime(s) {
    s = Math.floor(s || 0);
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d) return d + "d " + h + "h";
    if (h) return h + "h " + m + "m";
    if (m) return m + "m " + (s % 60) + "s";
    return s + "s";
  }

  function refreshMetrics() {
    return api.getMetrics().then(function (res) {
      var m = res.data || {};
      $("ops-metric-requests").textContent = (m.requests != null ? m.requests : api.state.requestCount).toLocaleString();
      $("ops-metric-pool").textContent = (m.poolActive != null ? m.poolActive : 0) + " / " + (m.poolSize != null ? m.poolSize : 8);
      $("ops-metric-rps").textContent = (m.rps != null ? m.rps : 0).toFixed(1);
      $("ops-metric-uptime").textContent = fmtUptime(m.uptimeSeconds);
      if (Array.isArray(m.series)) { metricsSeries = m.series.slice(-24); drawSpark(); }
    }).catch(function () { /* telemetry must never crash the UI */ });
  }

  function drawSpark() {
    var c = $("ops-spark");
    if (!c || !c.getContext || !metricsSeries.length) return;
    var dpr = global.devicePixelRatio || 1;
    var w = c.clientWidth || 320, h = 48;
    c.width = w * dpr; c.height = h * dpr;
    var ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    var max = Math.max.apply(null, metricsSeries) || 1;
    var min = Math.min.apply(null, metricsSeries);
    var range = Math.max(1, max - min);
    var step = w / (metricsSeries.length - 1 || 1);

    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(56,189,248,0.45)");
    grad.addColorStop(1, "rgba(56,189,248,0)");

    ctx.beginPath();
    metricsSeries.forEach(function (v, i) {
      var x = i * step;
      var y = h - 4 - ((v - min) / range) * (h - 10);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    var linePath = ctx;

    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    linePath.beginPath();
    metricsSeries.forEach(function (v, i) {
      var x = i * step;
      var y = h - 4 - ((v - min) / range) * (h - 10);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
  }

  function refreshAll() {
    return Promise.all([refreshHealth(), refreshMetrics()]);
  }

  function startPolling() {
    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      refreshHealth();
      refreshMetrics();
    }, POLL_MS);
  }

  function setCollapsed(collapsed) {
    var body = $("ops-body");
    var toggle = $("ops-toggle");
    body.classList.toggle("is-collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
  }

  function setChaos(on) {
    api.setChaos(on);
    var sw = $("ops-chaos-toggle");
    var badge = $("ops-chaos-badge");
    sw.setAttribute("aria-checked", String(on));
    badge.className = "badge " + (on ? "badge--danger" : "badge--muted");
    badge.textContent = on ? "active" : "off";
    if (on) { setPill("error", "Fault injected (503)", null); }
    refreshAll();
    refreshVersion();
    if (hooks.onChaos) hooks.onChaos(on);
  }

  function init(userHooks) {
    hooks = userHooks || {};
    $("ops-toggle").addEventListener("click", function () {
      setCollapsed(!$("ops-body").classList.contains("is-collapsed"));
    });

    $("ops-poll-now").addEventListener("click", function () {
      Base.toast && Base.toast.info("Polling telemetry…");
      refreshAll().then(function () {
        if (Base.toast) Base.toast.success("Telemetry refreshed", "Health and metrics updated.");
      });
    });

    $("ops-chaos-toggle").addEventListener("click", function () {
      var on = $("ops-chaos-toggle").getAttribute("aria-checked") !== "true";
      setChaos(on);
      if (Base.toast) {
        if (on) Base.toast.warn("Chaos enabled", "Backend now returns 503. Watch the storefront degrade gracefully.");
        else Base.toast.success("Chaos disabled", "Backend restored. Reloading catalog…");
      }
    });

    global.addEventListener("resize", drawSpark);

    // Initial load
    refreshVersion();
    refreshAll();
    startPolling();
  }

  Base.ops = {
    init: init,
    refreshAll: refreshAll,
    refreshVersion: refreshVersion,
    refreshMetrics: refreshMetrics,
    setChaos: setChaos
  };
})(window);
