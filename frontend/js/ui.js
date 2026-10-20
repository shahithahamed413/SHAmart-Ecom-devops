/* =============================================================
   ui.js — Presentational rendering (products, cart, states)
   DOM only exposes data-action hooks; app.js handles events.
   ============================================================= */
(function (global) {
  "use strict";
  var Base = (global.SHAMart = global.SHAMart || {});

  var moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

  function money(n) { return moneyFmt.format(Number(n) || 0); }
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function stars(rating) {
    var full = Math.round(rating || 0);
    var out = "";
    for (var i = 0; i < 5; i++) {
      out += '<svg viewBox="0 0 24 24" fill="' + (i < full ? "currentColor" : "none") +
        '" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8-4.3-4.1 5.9-.9z"/></svg>';
    }
    return '<span class="stars" role="img" aria-label="' + rating + ' out of 5 stars">' + out + "</span>";
  }

  function stockLine(stock) {
    if (stock <= 0) return '<span class="card__stock card__stock--out">Sold out</span>';
    if (stock <= 5) return '<span class="card__stock card__stock--low">' + stock + " left in stock</span>";
    return '<span class="card__stock card__stock--ok">' + stock + " in stock</span>";
  }

  function imgAttrs(product, cls) {
    return 'class="' + cls + '" loading="lazy" decoding="async" src="' + escapeHtml(product.image) +
      '" alt="' + escapeHtml(product.name) + '" data-fallback="' + escapeHtml(product.fallbackImage || "") + '"';
  }

  /* Delegate: swap broken remote images for inline placeholders. */
  function attachImageFallback(root) {
    root.addEventListener("error", function (e) {
      var img = e.target;
      if (img && img.tagName === "IMG" && img.dataset.fallback && img.src !== img.dataset.fallback) {
        img.src = img.dataset.fallback;
      }
    }, true);
  }

  function productCard(product) {
    var soldOut = product.stock <= 0;
    var el = document.createElement("article");
    el.className = "card";
    el.setAttribute("data-product-id", product.id);

    var promoBadge = product.promo ? '<span class="tag tag--promo">Promo</span>' : "";
    var soldBadge = soldOut ? '<span class="tag tag--soldout">Sold out</span>' : "";
    var veil = soldOut ? '<div class="card__soldout-veil"></div>' : "";
    var was = product.oldPrice ? '<span class="card__price-was">' + money(product.oldPrice) + "</span>" : "";

    el.innerHTML =
      '<div class="card__media">' +
        '<img ' + imgAttrs(product, "card__img") + ' />' +
        veil +
        '<div class="card__badges">' + promoBadge + soldBadge + "</div>" +
      "</div>" +
      '<div class="card__body">' +
        '<span class="card__cat">' + escapeHtml(product.category) + "</span>" +
        '<h3 class="card__title"><a href="#catalog" data-action="view" data-id="' + product.id + '">' + escapeHtml(product.name) + "</a></h3>" +
        '<p class="card__desc">' + escapeHtml(product.description) + "</p>" +
        '<div class="card__rating">' + stars(product.rating) + "<span>" + product.rating.toFixed(1) + " · " + product.reviews + " reviews</span></div>" +
        '<div class="card__foot">' +
          "<div>" +
            '<div class="card__price">' + was + '<span class="card__price-now">' + money(product.price) + "</span></div>" +
            stockLine(product.stock) +
          "</div>" +
          '<div class="card__actions">' +
            '<button class="btn ' + (soldOut ? "btn--ghost" : "btn--primary") + ' btn--sm" type="button" ' +
              'data-action="add" data-id="' + product.id + '" ' +
              (soldOut ? 'disabled aria-disabled="true"' : "") + ">" +
              (soldOut ? "Sold out" : "Add to cart") +
            "</button>" +
          "</div>" +
        "</div>" +
      "</div>";
    return el;
  }

  function skeletonCard() {
    var el = document.createElement("div");
    el.className = "skeleton";
    el.innerHTML =
      '<div class="skeleton__media"></div>' +
      '<div class="skeleton__body">' +
        '<div class="skeleton__line skeleton__line--sm"></div>' +
        '<div class="skeleton__line skeleton__line--lg"></div>' +
        '<div class="skeleton__line"></div>' +
        '<div class="skeleton__line"></div>' +
      "</div>";
    return el;
  }

  function renderSkeletons(n) {
    var grid = document.getElementById("product-grid");
    grid.setAttribute("aria-busy", "true");
    grid.innerHTML = "";
    for (var i = 0; i < (n || 8); i++) grid.appendChild(skeletonCard());
  }

  function renderProducts(products, emptyEl, gridEl) {
    var grid = gridEl || document.getElementById("product-grid");
    var empty = emptyEl || document.getElementById("empty-state");
    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = "";
    if (!products.length) {
      grid.hidden = true;
      if (empty) empty.hidden = false;
      return;
    }
    grid.hidden = false;
    if (empty) empty.hidden = true;
    var frag = document.createDocumentFragment();
    products.forEach(function (p) { frag.appendChild(productCard(p)); });
    grid.appendChild(frag);
  }

  /* ---------- Cart ---------- */
  function cartItem(line) {
    var el = document.createElement("div");
    el.className = "cart-item";
    el.setAttribute("data-product-id", line.id);
    el.innerHTML =
      '<img ' + imgAttrs(line, "cart-item__media") + ' />' +
      '<div class="cart-item__info">' +
        '<p class="cart-item__title">' + escapeHtml(line.name) + "</p>" +
        '<p class="cart-item__cat">' + escapeHtml(line.category) + "</p>" +
        '<p class="cart-item__price mono">' + money(line.price) + "</p>" +
      "</div>" +
      '<div class="cart-item__side">' +
        '<div class="qty" role="group" aria-label="Quantity for ' + escapeHtml(line.name) + '">' +
          '<button type="button" data-action="dec" data-id="' + line.id + '" aria-label="Decrease quantity"' +
            (line.qty <= 1 ? "" : "") + ">−</button>" +
          '<span aria-live="polite">' + line.qty + "</span>" +
          '<button type="button" data-action="inc" data-id="' + line.id + '" aria-label="Increase quantity"' +
            (line.qty >= line.stock ? " disabled" : "") + ">+</button>" +
        "</div>" +
        '<button type="button" class="link-danger" data-action="remove" data-id="' + line.id + '">Remove</button>' +
      "</div>";
    return el;
  }

  function renderCart(state) {
    var host = document.getElementById("cart-items");
    var submit = document.getElementById("checkout-open");
    var subtotal = document.getElementById("cart-subtotal");
    var shipping = document.getElementById("cart-shipping");
    var total = document.getElementById("cart-total");
    var titleCount = document.getElementById("cart-title-count");

    host.innerHTML = "";
    if (!state.items.length) {
      var empty = document.createElement("div");
      empty.className = "drawer__empty";
      empty.innerHTML =
        '<div class="drawer__empty-icon" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.55L21 8H6"/><circle cx="10" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>' +
        "</div>" +
        "<p><strong>Your cart is empty</strong></p>" +
        "<p>Add a few products to get started.</p>";
      host.appendChild(empty);
    } else {
      var frag = document.createDocumentFragment();
      state.items.forEach(function (l) { frag.appendChild(cartItem(l)); });
      host.appendChild(frag);
    }

    subtotal.textContent = money(state.subtotal);
    shipping.textContent = state.shipping === 0
      ? (state.items.length ? "Free" : money(0))
      : money(state.shipping);
    total.textContent = money(state.total);
    titleCount.textContent = state.count;
    submit.disabled = state.items.length === 0;
  }

  function updateCartBadge(count, animate) {
    var badge = document.getElementById("cart-count");
    if (!badge) return;
    badge.textContent = count;
    badge.dataset.count = count;
    badge.classList.toggle("is-visible", count > 0);
    if (animate && count > 0) {
      badge.classList.remove("is-bump");
      void badge.offsetWidth;
      badge.classList.add("is-bump");
    }
  }

  /* ---------- Error boundary ---------- */
  var boundaryState = { degraded: false };
  function showBoundary(title, text) {
    var el = document.getElementById("boundary");
    if (title) document.getElementById("boundary-title").textContent = title;
    if (text) document.getElementById("boundary-text").textContent = text;
    el.hidden = false;
    boundaryState.degraded = true;
  }
  function hideBoundary() {
    document.getElementById("boundary").hidden = true;
    boundaryState.degraded = false;
  }
  function isDegraded() { return boundaryState.degraded; }

  Base.ui = {
    money: money, escapeHtml: escapeHtml, stars: stars,
    productCard: productCard, renderProducts: renderProducts, renderSkeletons: renderSkeletons,
    renderCart: renderCart, updateCartBadge: updateCartBadge,
    attachImageFallback: attachImageFallback,
    showBoundary: showBoundary, hideBoundary: hideBoundary, isDegraded: isDegraded
  };
})(window);
