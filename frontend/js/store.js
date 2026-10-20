/* =============================================================
   store.js — Cart state container (pub/sub + persistence)
   ============================================================= */
(function (global) {
  "use strict";
  var Base = (global.SHAMart = global.SHAMart || {});

  var STORAGE_KEY = "shamart.cart.v1";
  var FREE_SHIPPING_THRESHOLD = 75;
  var FLAT_SHIPPING = 9.99;

  var listeners = [];
  var items = load();

  function load() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function persist() {
    try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (e) { /* quota/private mode */ }
  }

  function emit() {
    persist();
    var snapshot = getState();
    listeners.forEach(function (fn) {
      try { fn(snapshot); } catch (e) { console.error("[store] listener error", e); }
    });
  }

  function toLine(product, qty) {
    return {
      id: product.id,
      name: product.name,
      category: product.category,
      price: Number(product.price) || 0,
      image: product.image,
      fallbackImage: product.fallbackImage,
      stock: typeof product.stock === "number" ? product.stock : Infinity,
      qty: qty
    };
  }

  function find(id) {
    id = String(id);
    for (var i = 0; i < items.length; i++) { if (String(items[i].id) === id) return items[i]; }
    return null;
  }

  var store = {
    subscribe: function (fn) {
      listeners.push(fn);
      fn(getState());
      return function () { listeners = listeners.filter(function (l) { return l !== fn; }); };
    },

    add: function (product, qty) {
      qty = Math.max(1, qty || 1);
      var line = find(product.id);
      var cap = typeof product.stock === "number" ? product.stock : Infinity;

      if (line) {
        if (line.qty >= cap) return { ok: false, reason: "max", line: line };
        line.qty = Math.min(cap, line.qty + qty);
      } else {
        if (cap <= 0) return { ok: false, reason: "soldout" };
        items.push(toLine(product, Math.min(cap, qty)));
      }
      emit();
      return { ok: true, line: find(product.id) };
    },

    setQty: function (id, qty) {
      var line = find(id);
      if (!line) return;
      qty = Math.floor(qty);
      if (qty <= 0) return store.remove(id);
      line.qty = Math.min(qty, line.stock);
      emit();
    },

    increment: function (id) {
      var line = find(id);
      if (!line || line.qty >= line.stock) return false;
      line.qty += 1; emit(); return true;
    },

    decrement: function (id) {
      var line = find(id);
      if (!line) return false;
      if (line.qty <= 1) return store.remove(id), true;
      line.qty -= 1; emit(); return true;
    },

    remove: function (id) {
      items = items.filter(function (l) { return l.id !== id; });
      emit();
    },

    clear: function () { items = []; emit(); },

    hydrate: function () { emit(); },

    getItems: function () { return items.slice(); },
    count: function () { return items.reduce(function (n, l) { return n + l.qty; }, 0); },
    lineCount: function () { return items.length; },
    subtotal: function () { return items.reduce(function (s, l) { return s + l.price * l.qty; }, 0); },
    shipping: function () {
      if (!items.length) return 0;
      var sub = store.subtotal();
      return sub >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING;
    },
    total: function () { return store.subtotal() + store.shipping(); },
    threshold: FREE_SHIPPING_THRESHOLD
  };

  function getState() {
    return {
      items: items.slice(),
      count: store.count(),
      lineCount: store.lineCount(),
      subtotal: store.subtotal(),
      shipping: store.shipping(),
      total: store.total(),
      freeShippingThreshold: FREE_SHIPPING_THRESHOLD
    };
  }

  Base.store = store;
})(window);
