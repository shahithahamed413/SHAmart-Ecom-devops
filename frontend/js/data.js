/* =============================================================
   data.js — Realistic fallback dataset (mock JSON)
   Used automatically whenever the FastAPI backend is unreachable.
   Shape mirrors the documented /api/v1 contract.
   ============================================================= */
(function (global) {
  "use strict";

  var Base = (global.SHAMart = global.SHAMart || {});

  /* Deterministic gradient placeholder (no network required). */
  function placeholder(label, seed) {
    var palettes = [
      ["#0ea5e9", "#0c4a6e"], ["#38bdf8", "#0369a1"], ["#22d3ee", "#0e7490"],
      ["#60a5fa", "#1e3a8a"], ["#818cf8", "#312e81"], ["#2dd4bf", "#115e59"]
    ];
    var p = palettes[seed % palettes.length];
    var initial = (label || "SH").trim().charAt(0).toUpperCase();
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + p[0] + '"/><stop offset="1" stop-color="' + p[1] + '"/>' +
      '</linearGradient></defs>' +
      '<rect width="640" height="480" fill="url(#g)"/>' +
      '<circle cx="500" cy="90" r="150" fill="rgba(255,255,255,0.08)"/>' +
      '<circle cx="120" cy="400" r="180" fill="rgba(255,255,255,0.06)"/>' +
      '<text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" ' +
      'font-family="Inter, sans-serif" font-size="200" font-weight="800" fill="rgba(255,255,255,0.9)">' +
      initial + "</text></svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  var categories = [
    { id: "all", name: "All" },
    { id: "audio", name: "Audio" },
    { id: "laptops", name: "Laptops" },
    { id: "phones", name: "Phones" },
    { id: "wearables", name: "Wearables" },
    { id: "home", name: "Smart Home" },
    { id: "accessories", name: "Accessories" }
  ];

  var products = [
    {
      id: "sha-audio-001", name: "Aurora Noise-Cancelling Headphones", category: "audio",
      price: 249.0, oldPrice: 329.0, rating: 4.8, reviews: 1284, stock: 18, promo: true,
      description: "Hybrid ANC, 40-hour battery and spatial audio for deep-focus listening."
    },
    {
      id: "sha-audio-002", name: "Pulse Wireless Earbuds", category: "audio",
      price: 99.0, oldPrice: 129.0, rating: 4.5, reviews: 862, stock: 4, promo: true,
      description: "Compact in-ears with adaptive EQ and a pocket-sized charging case."
    },
    {
      id: "sha-laptop-001", name: "Nimbus 14 Ultrabook", category: "laptops",
      price: 1199.0, oldPrice: null, rating: 4.7, reviews: 431, stock: 9, promo: false,
      description: "14\" 3K display, 32GB RAM and all-day battery in a 1.1kg chassis."
    },
    {
      id: "sha-laptop-002", name: "Forge X Gaming Laptop", category: "laptops",
      price: 1899.0, oldPrice: 2099.0, rating: 4.6, reviews: 298, stock: 0, promo: true,
      description: "240Hz panel, flagship GPU and vapor-chamber cooling for marathon sessions."
    },
    {
      id: "sha-phone-001", name: "Vertex 6 Pro Smartphone", category: "phones",
      price: 899.0, oldPrice: 999.0, rating: 4.9, reviews: 2044, stock: 27, promo: true,
      description: "Triple 50MP camera system, titanium frame and 120Hz adaptive display."
    },
    {
      id: "sha-phone-002", name: "Vertex Lite 5G", category: "phones",
      price: 449.0, oldPrice: null, rating: 4.4, reviews: 733, stock: 3, promo: false,
      description: "Affordable 5G with a 2-day battery and clean, bloat-free software."
    },
    {
      id: "sha-wear-001", name: "Orbit Smartwatch 3", category: "wearables",
      price: 329.0, oldPrice: 379.0, rating: 4.6, reviews: 512, stock: 14, promo: true,
      description: "ECG, SpO2 and 10-day battery with a sapphire always-on display."
    },
    {
      id: "sha-wear-002", name: "Vital Fitness Band", category: "wearables",
      price: 79.0, oldPrice: null, rating: 4.3, reviews: 988, stock: 41, promo: false,
      description: "Lightweight tracker with sleep insights and 5ATM water resistance."
    },
    {
      id: "sha-home-001", name: "Halo Smart Speaker", category: "home",
      price: 129.0, oldPrice: 159.0, rating: 4.5, reviews: 604, stock: 22, promo: true,
      description: "Room-filling 360° sound with hub support for your smart sensors."
    },
    {
      id: "sha-home-002", name: "Lumen Smart Bulb (4-pack)", category: "home",
      price: 49.0, oldPrice: null, rating: 4.2, reviews: 341, stock: 0, promo: false,
      description: "16M colours, schedules and scenes — works with all major assistants."
    },
    {
      id: "sha-home-003", name: "Guard Security Camera", category: "home",
      price: 179.0, oldPrice: 219.0, rating: 4.4, reviews: 277, stock: 11, promo: true,
      description: "2K HDR video, on-device AI alerts and local encrypted storage."
    },
    {
      id: "sha-acc-001", name: "Flux 100W GaN Charger", category: "accessories",
      price: 59.0, oldPrice: 79.0, rating: 4.7, reviews: 812, stock: 35, promo: true,
      description: "Four ports, 100W total — charge a laptop and three devices at once."
    },
    {
      id: "sha-acc-002", name: "MagLink 10K Power Bank", category: "accessories",
      price: 69.0, oldPrice: null, rating: 4.5, reviews: 466, stock: 6, promo: false,
      description: "Magnetic 10,000mAh pack with USB-C PD passthrough charging."
    },
    {
      id: "sha-acc-003", name: "Studio USB-C Microphone", category: "accessories",
      price: 139.0, oldPrice: 169.0, rating: 4.6, reviews: 219, stock: 17, promo: true,
      description: "Cardioid condenser with zero-latency monitoring and a mute tap."
    }
  ];

  products.forEach(function (p, i) {
    p.image = "https://picsum.photos/seed/" + p.id + "/640/480";
    p.fallbackImage = placeholder(p.name, i + 1);
    p.currency = "USD";
  });

  Base.mock = {
    categories: categories,
    products: products,

    version: {
      app: "SHAMart API",
      apiVersion: "v1",
      gitCommit: "9f3c1a7e4b2d8c0f5a6e91b3d7c248af0e5b6d91",
      shortSha: "9f3c1a7",
      containerTag: "shamart-api:2026.10.3-rc4",
      environment: "staging-eu-west-1",
      buildTime: "2026-10-10T08:42:11Z",
      node: "cluster-prod-blue/worker-02"
    },

    readyz: function () {
      return {
        status: "ok",
        database: { connected: true, driver: "aiomysql", pool: { active: 3, idle: 5, size: 8 }, latencyMs: 1.4 },
        checks: { cache: "ok", migrations: "applied" },
        uptimeSeconds: Math.floor(performance.now() / 1000) + 37245
      };
    },

    metrics: function () {
      return {
        requests: 182734,
        poolActive: 3,
        poolSize: 8,
        rps: 42.7,
        uptimeSeconds: Math.floor(performance.now() / 1000) + 37245,
        series: [18, 22, 19, 26, 31, 28, 35, 40, 37, 44, 39, 47, 52, 48, 55, 61]
      };
    }
  };
})(window);
