/* =============================================================
   api.js — API integration layer
   All calls target RELATIVE paths so the app runs behind any
   ingress/proxy in Kubernetes. If the backend is unreachable the
   layer transparently serves realistic mock JSON instead of
   throwing — except when the Chaos Simulator forces degradation,
   in which case failures propagate so the UI error boundary is
   exercised.
   ============================================================= */
(function (global) {
  "use strict";
  var Base = (global.SHAMart = global.SHAMart || {});
  var mock = Base.mock;

  var CONFIG = {
    baseUrl: "",                 // relative — same origin / ingress
    timeoutMs: 6000,
    endpoints: {
      products: "/api/v1/products",
      product: "/api/v1/products/",
      orders: "/api/v1/orders",
      readyz: "/readyz",
      version: "/api/v1/version",
      metrics: "/metrics"
    }
  };

  /* ---- Public state ---- */
  var state = {
    source: "unknown",   // "live" | "mock"
    chaos: false,        // fault injection toggle
    requestCount: 0,
    lastError: null
  };

  function ApiError(message, status, payload) {
    this.name = "ApiError";
    this.message = message;
    this.status = status || 0;
    this.payload = payload || null;
  }
  ApiError.prototype = Object.create(Error.prototype);

  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var jitter = function (min, max) { return Math.floor(min + Math.random() * (max - min)); };

  /* Core fetch with timeout + chaos support. */
  function raw(path, options) {
    options = options || {};
    state.requestCount += 1;

    if (state.chaos) {
      return wait(jitter(120, 320)).then(function () {
        throw new ApiError("Service Unavailable — chaos injection active", 503, { detail: "Upstream FastAPI worker degraded by operator" });
      });
    }

    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, CONFIG.timeoutMs) : null;

    return fetch(CONFIG.baseUrl + path, {
      headers: Object.assign({ Accept: "application/json" }, options.headers || {}),
      signal: ctrl ? ctrl.signal : undefined,
      method: options.method || "GET",
      body: options.body
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) {
        throw new ApiError("Request to " + path + " failed with " + res.status, res.status);
      }
      var ct = res.headers.get("content-type") || "";
      return ct.indexOf("application/json") !== -1 ? res.json() : res.text();
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      if (err instanceof ApiError) throw err;
      throw new ApiError(err && err.message ? err.message : "Network request failed", 0);
    });
  }

  /* Live-or-mock resolver. */
  function withFallback(path, options, mockFn) {
    return raw(path, options)
      .then(function (data) {
        state.source = "live";
        state.lastError = null;
        return { data: data, source: "live" };
      })
      .catch(function (err) {
        state.lastError = err;
        if (state.chaos) throw err;                 // let the error boundary render
        return wait(jitter(80, 240)).then(function () {
          state.source = "mock";
          return { data: mockFn(), source: "mock" };
        });
      });
  }

  /* ---- Public API ---- */
  function getProducts(params) {
    params = params || {};
    var qs = [];
    if (params.category && params.category !== "all") qs.push("category=" + encodeURIComponent(params.category));
    if (params.q) qs.push("q=" + encodeURIComponent(params.q));
    var path = CONFIG.endpoints.products + (qs.length ? "?" + qs.join("&") : "");

    return withFallback(path, {}, function () {
      var list = mock.products.slice();
      if (params.category && params.category !== "all") {
        list = list.filter(function (p) { return p.category === params.category; });
      }
      if (params.q) {
        var needle = params.q.toLowerCase();
        list = list.filter(function (p) {
          return (p.name + " " + p.description + " " + p.category).toLowerCase().indexOf(needle) !== -1;
        });
      }
      return { items: list, total: list.length };
    }).then(function (r) {
      var payload = r.data || {};
      var items = Array.isArray(payload) ? payload : (payload.items || []);
      return { items: items, total: payload.total != null ? payload.total : items.length, source: r.source };
    });
  }

  function getProduct(id) {
    return withFallback(CONFIG.endpoints.product + encodeURIComponent(id), {}, function () {
      var found = mock.products.filter(function (p) { return p.id === id; })[0];
      if (!found) throw new ApiError("Product not found", 404);
      return found;
    }).then(function (r) { return { data: r.data, source: r.source }; });
  }

  function getReadyz() {
    return raw(CONFIG.endpoints.readyz, {})
      .then(function (data) { state.source = "live"; return { data: data, source: "live" }; })
      .catch(function (err) {
        state.lastError = err;
        return { data: mock.readyz(), source: "mock", degraded: true, error: err };
      });
  }

  function getVersion() {
    return withFallback(CONFIG.endpoints.version, {}, function () { return mock.version; })
      .then(function (r) { return { data: r.data, source: r.source }; });
  }

  function getMetrics() {
    return withFallback(CONFIG.endpoints.metrics, {}, function () { return mock.metrics(); })
      .then(function (r) { return { data: r.data, source: r.source }; });
  }

  /* UI cart shape -> backend order contract. */
  function toOrderRequest(payload) {
    var customer = (payload && payload.customer) || {};
    return {
      customer_name: customer.name,
      customer_email: customer.email,
      shipping_address: customer.address,
      total_amount: payload && payload.total,
      items: ((payload && payload.items) || []).map(function (line) {
        return { product_id: line.id, quantity: line.qty };
      })
    };
  }

  /* backend order contract -> UI success shape. */
  function toOrderView(data, payload) {
    var customer = (payload && payload.customer) || {};
    return {
      id: data && data.order_id != null ? data.order_id : (data && data.id),
      status: (data && data.status) || "CONFIRMED",
      total: payload && payload.total,
      customer: { name: customer.name, email: customer.email },
      eta: (data && data.eta) || "2 business days"
    };
  }

  function createOrder(payload) {
    return raw(CONFIG.endpoints.orders, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toOrderRequest(payload))
    }).then(function (data) {
      state.source = "live";
      state.lastError = null;
      return { data: toOrderView(data, payload), source: "live" };
    }).catch(function (err) {
      state.lastError = err;
      if (state.chaos) throw err;
      // A server-side rejection (4xx) is a real business error — surface it
      // instead of masking it with a fake mock success.
      if (err.status >= 400 && err.status < 500) throw err;
      return wait(jitter(500, 1100)).then(function () {
        state.source = "mock";
        return {
          data: {
            id: "ord_" + Date.now().toString(36).toUpperCase(),
            status: "confirmed",
            createdAt: new Date().toISOString(),
            total: payload && payload.total,
            customer: payload && payload.customer,
            eta: "2 business days"
          },
          source: "mock"
        };
      });
    });
  }

  function setChaos(on) { state.chaos = !!on; }

  Base.api = {
    config: CONFIG,
    state: state,
    ApiError: ApiError,
    getProducts: getProducts,
    getProduct: getProduct,
    getReadyz: getReadyz,
    getVersion: getVersion,
    getMetrics: getMetrics,
    createOrder: createOrder,
    setChaos: setChaos
  };
})(window);
