/* =============================================================
   app.js — Application orchestrator
   Wires the storefront, cart, checkout and ops console together.
   ============================================================= */
(function (global) {
  "use strict";
  var Base = (global.SHAMart = global.SHAMart || {});
  var api = Base.api, store = Base.store, ui = Base.ui, toast = Base.toast, ops = Base.ops;

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    master: [],                 // last successfully loaded product list
    filters: { category: "all", q: "", sort: "featured" },
    loadedOnce: false,
    notifySource: false
  };

  var lastFocused = null;

  /* ---------------- Catalog ---------------- */
  function applyFilters() {
    var list = state.master.slice();
    if (state.filters.category !== "all") {
      list = list.filter(function (p) { return p.category === state.filters.category; });
    }
    if (state.filters.q) {
      var n = state.filters.q.toLowerCase();
      list = list.filter(function (p) {
        return (p.name + " " + p.description + " " + p.category).toLowerCase().indexOf(n) !== -1;
      });
    }
    list.sort(sorter(state.filters.sort));
    ui.renderProducts(list);
    updateCatalogSub(list.length);
  }

  function sorter(mode) {
    return function (a, b) {
      switch (mode) {
        case "price-asc": return a.price - b.price;
        case "price-desc": return b.price - a.price;
        case "rating": return b.rating - a.rating;
        case "name": return a.name.localeCompare(b.name);
        default:
          return (b.promo === true) - (a.promo === true) || b.rating - a.rating;
      }
    };
  }

  function updateCatalogSub(count) {
    var sub = $("catalog-sub");
    if (state.filters.q) sub.textContent = count + ' result' + (count === 1 ? "" : "s") + ' for “' + state.filters.q + '”';
    else if (state.filters.category !== "all") sub.textContent = count + " products in " + labelForCategory(state.filters.category) + ".";
    else sub.textContent = "Curated picks across every category.";
  }

  function labelForCategory(id) {
    var c = (Base.mock.categories || []).filter(function (x) { return x.id === id; })[0];
    return c ? c.name : id;
  }

  function loadProducts(opts) {
    opts = opts || {};
    if (!state.loadedOnce) ui.renderSkeletons(8);
    return api.getProducts({}).then(function (res) {
      state.master = res.items || [];
      state.loadedOnce = true;
      ui.hideBoundary();
      applyFilters();
      $("hero-stat-products").textContent = String(state.master.filter(function (p) { return p.stock > 0; }).length);

      if (res.source === "mock" && !state.notifySource) {
        state.notifySource = true;
        toast.info("Running on offline data", "Backend unreachable — serving the built-in mock catalog.");
      }
      return res;
    }).catch(function (err) {
      if (state.master.length) {
        applyFilters();
      } else {
        var grid = $("product-grid");
        grid.innerHTML = "";
        grid.setAttribute("aria-busy", "false");
        grid.hidden = true;
        $("empty-state").hidden = true;
      }
      ui.showBoundary(
        "Catalog service unavailable",
        "The backend returned " + (err.status || "an error") + ". We're showing the last known catalog — retry when you're ready."
      );
      toast.error("Catalog unavailable", err.message || "Request failed.");
      throw err;
    });
  }

  /* ---------------- Cart ---------------- */
  function addToCart(id) {
    id = String(id);
    var product = state.master.filter(function (p) { return String(p.id) === id; })[0];
    if (!product) return;
    var result = store.add(product, 1);
    if (!result.ok) {
      if (result.reason === "max") toast.warn("Stock limit reached", "No more units available for " + product.name + ".");
      else toast.warn("Sold out", product.name + " is currently unavailable.");
      return;
    }
    toast.success("Added to cart", product.name + " · " + ui.money(product.price));
  }

  function showProductDetail(id) {
    api.getProduct(id).then(function (res) {
      var p = res.data || {};
      toast.show({
        type: "info",
        title: p.name || "Product",
        message: (p.description || "") + " · " + ui.money(p.price) + " · " + (res.source === "live" ? "live" : "mock"),
        duration: 6000
      });
    }).catch(function () {
      toast.error("Could not load product", "The product detail service is unavailable.");
    });
  }

  function openDrawer() {
    lastFocused = document.activeElement;
    $("overlay").hidden = false;
    requestAnimationFrame(function () { $("overlay").classList.add("is-open"); });
    var drawer = $("cart-drawer");
    drawer.setAttribute("aria-hidden", "false");
    drawer.classList.add("is-open");
    lockScroll(true);
    setTimeout(function () { $("cart-close").focus(); }, 60);
  }

  function closeDrawer() {
    var drawer = $("cart-drawer");
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    var overlay = $("overlay");
    overlay.classList.remove("is-open");
    setTimeout(function () { overlay.hidden = true; }, 300);
    lockScroll(false);
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function openModal(id) {
    lastFocused = document.activeElement;
    var m = $(id);
    m.hidden = false;
    lockScroll(true);
    var focusable = m.querySelector("input, select, textarea, button:not([disabled])");
    setTimeout(function () { focusable && focusable.focus(); }, 60);
  }

  function closeModal(id) {
    var m = $(id);
    if (!m || m.hidden) return;
    m.hidden = true;
    if ($("cart-drawer").classList.contains("is-open")) return;
    lockScroll(false);
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function lockScroll(lock) {
    document.body.style.overflow = lock ? "hidden" : "";
  }

  /* ---------------- Checkout ---------------- */
  function validateCheckout(form) {
    var fields = [
      { name: "name", el: $("co-name"), ok: function (v) { return v.trim().length >= 2; }, msg: "Please enter your full name." },
      { name: "email", el: $("co-email"), ok: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); }, msg: "Please enter a valid email address." },
      { name: "address", el: $("co-address"), ok: function (v) { return v.trim().length >= 6; }, msg: "Please enter a shipping address." }
    ];
    var valid = true;
    fields.forEach(function (f) {
      var errEl = form.querySelector('[data-error-for="' + f.name + '"]');
      var good = f.ok(f.el.value);
      f.el.setAttribute("aria-invalid", String(!good));
      if (errEl) { errEl.hidden = good; errEl.textContent = good ? "" : f.msg; }
      if (!good && valid) { f.el.focus(); }
      valid = valid && good;
    });
    return valid;
  }

  function submitOrder(e) {
    e.preventDefault();
    var form = $("checkout-form");
    $("checkout-error").hidden = true;
    if (!validateCheckout(form)) {
      toast.warn("Check your details", "Some checkout fields need attention.");
      return;
    }
    if (!store.lineCount()) { toast.warn("Cart is empty", "Add products before checking out."); return; }

    var btn = $("checkout-submit");
    btn.disabled = true;
    btn.querySelector(".btn__spinner").hidden = false;
    btn.querySelector(".btn__label").textContent = "Processing…";

    var payload = {
      customer: {
        name: $("co-name").value.trim(),
        email: $("co-email").value.trim(),
        address: $("co-address").value.trim()
      },
      payment: (form.querySelector('input[name="payment"]:checked') || {}).value || "card",
      items: store.getItems().map(function (l) { return { id: l.id, name: l.name, qty: l.qty, price: l.price }; }),
      subtotal: store.subtotal(),
      shipping: store.shipping(),
      total: store.total()
    };

    api.createOrder(payload).then(function (res) {
      toast.success("Order placed", "Order " + res.data.id + " confirmed via " + res.source + " backend.");
      closeModal("checkout-modal");
      showSuccess(res.data);
      store.clear();
    }).catch(function (err) {
      $("checkout-error-text").textContent = "Payment could not be completed (" + (err.status || "network") +
        "). Our payment service is temporarily degraded — please retry.";
      $("checkout-error").hidden = false;
      toast.error("Checkout failed", err.message || "Payment service unavailable.");
    }).finally(function () {
      btn.disabled = false;
      btn.querySelector(".btn__spinner").hidden = true;
      btn.querySelector(".btn__label").textContent = "Pay & place order";
    });
  }

  function showSuccess(order) {
    $("success-name").textContent = (order.customer && order.customer.name) || "friend";
    $("success-id").textContent = order.id;
    $("success-email").textContent = (order.customer && order.customer.email) || "—";
    $("success-total").textContent = ui.money(order.total);
    $("success-eta").textContent = order.eta || "2 business days";
    openModal("success-modal");
  }

  /* ---------------- Navigation / search ---------------- */
  function renderCategoryNav() {
    var nav = $("cat-nav");
    nav.innerHTML = "";
    (Base.mock.categories || []).forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "cat-chip";
      b.textContent = c.name;
      b.dataset.category = c.id;
      b.setAttribute("aria-pressed", String(c.id === state.filters.category));
      b.addEventListener("click", function () {
        state.filters.category = c.id;
        Array.prototype.forEach.call(nav.children, function (chip) {
          chip.setAttribute("aria-pressed", String(chip.dataset.category === c.id));
        });
        applyFilters();
      });
      nav.appendChild(b);
    });
  }

  function debounce(fn, ms) {
    var t; return function () {
      var args = arguments, ctx = this;
      clearTimeout(t); t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  /* ---------------- Event wiring ---------------- */
  function wire() {
    // Header + hero scroll
    document.querySelectorAll("[data-scroll-to]").forEach(function (el) {
      el.addEventListener("click", function () {
        var target = $(el.dataset.scrollTo);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    // Search
    var input = $("search-input");
    var clear = $("search-clear");
    var run = debounce(function () {
      state.filters.q = input.value.trim();
      clear.hidden = !input.value;
      applyFilters();
    }, 220);
    input.addEventListener("input", run);
    clear.addEventListener("click", function () {
      input.value = ""; state.filters.q = ""; clear.hidden = true; applyFilters(); input.focus();
    });

    // Sort
    $("sort-select").addEventListener("change", function (e) {
      state.filters.sort = e.target.value;
      applyFilters();
    });

    // Product grid delegation
    $("product-grid").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]");
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === "add") addToCart(btn.dataset.id);
      else if (action === "view") { e.preventDefault(); showProductDetail(btn.dataset.id); }
    });

    // Image fallback (products + cart)
    ui.attachImageFallback(document.getElementById("product-grid"));
    ui.attachImageFallback(document.getElementById("cart-items"));

    // Empty state reset
    $("empty-reset").addEventListener("click", function () {
      state.filters = { category: "all", q: "", sort: "featured" };
      input.value = ""; clear.hidden = true; $("sort-select").value = "featured";
      Array.prototype.forEach.call($("cat-nav").children, function (c) {
        c.setAttribute("aria-pressed", String(c.dataset.category === "all"));
      });
      applyFilters();
    });

    // Boundary
    $("boundary-retry").addEventListener("click", function () {
      toast.info("Retrying catalog…");
      loadProducts({ force: true }).then(function () {
        toast.success("Catalog restored", "Live product data reloaded.");
      }).catch(function () {});
    });
    $("boundary-dismiss").addEventListener("click", function () { ui.hideBoundary(); });

    // Cart drawer
    $("cart-trigger").addEventListener("click", openDrawer);
    $("cart-close").addEventListener("click", closeDrawer);
    $("overlay").addEventListener("click", closeDrawer);
    $("cart-clear").addEventListener("click", function () {
      if (!store.lineCount()) return;
      if (global.confirm("Remove all items from your cart?")) {
        store.clear();
        toast.info("Cart cleared", "All items were removed.");
      }
    });

    // Cart item delegation
    $("cart-items").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]");
      if (!btn) return;
      var id = btn.dataset.id, action = btn.dataset.action;
      if (action === "inc") { if (!store.increment(id)) toast.warn("Stock limit reached", "No more units available."); }
      else if (action === "dec") store.decrement(id);
      else if (action === "remove") {
        var p = store.getItems().filter(function (l) { return l.id === id; })[0];
        store.remove(id);
        if (p) toast.info("Removed from cart", p.name);
      }
    });

    // Checkout
    $("checkout-open").addEventListener("click", function () {
      $("checkout-total").textContent = ui.money(store.total());
      $("checkout-error").hidden = true;
      closeDrawer();
      setTimeout(function () { openModal("checkout-modal"); }, 220);
    });
    $("checkout-form").addEventListener("submit", submitOrder);
    ["co-name", "co-email", "co-address"].forEach(function (id) {
      $(id).addEventListener("input", function () {
        $(id).setAttribute("aria-invalid", "false");
        var err = $("checkout-form").querySelector('[data-error-for="' + id.replace("co-", "") + '"]');
        if (err) err.hidden = true;
      });
    });

    // Modal close (backdrop + buttons)
    document.querySelectorAll("[data-close-modal]").forEach(function (el) {
      el.addEventListener("click", function () {
        var modal = el.closest(".modal");
        if (modal) closeModal(modal.id);
      });
    });

    // Keyboard
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (!$("success-modal").hidden) closeModal("success-modal");
        else if (!$("checkout-modal").hidden) closeModal("checkout-modal");
        else if ($("cart-drawer").classList.contains("is-open")) closeDrawer();
      }
      if (e.key === "/" && document.activeElement !== input) { e.preventDefault(); input.focus(); }
    });

    // Store subscription → cart UI + badge
    store.subscribe(function (snapshot) {
      ui.renderCart(snapshot);
      ui.updateCartBadge(snapshot.count, true);
    });
    ui.updateCartBadge(store.count(), false);

    // Footer year
    $("footer-year").textContent = new Date().getFullYear();
  }

  /* ---------------- Ops hooks ---------------- */
  function initOps() {
    ops.init({
      onChaos: function (on) {
        // Re-fetch catalog to exercise the degradation path.
        if (on) {
          loadProducts({ force: true }).catch(function () { /* boundary handles it */ });
        } else {
          state.notifySource = false;
          loadProducts({ force: true }).then(function () {
            ui.hideBoundary();
          }).catch(function () {});
        }
      },
      onStatus: function (info) {
        var note = $("ops-note");
        if (info.degraded) {
          note.textContent = "Backend health check is degraded. The storefront is operating in resilient/offline mode.";
        } else {
          note.textContent = "Telemetry auto-refreshes every 10s. Mock values are shown while the backend is unreachable.";
        }
      }
    });
  }

  /* ---------------- Boot ---------------- */
  function boot() {
    renderCategoryNav();
    wire();
    initOps();
    store.hydrate();
    loadProducts().catch(function () { /* boundary already shown */ });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
