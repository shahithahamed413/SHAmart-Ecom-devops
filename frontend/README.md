# SHAMart — Cloud-Native E-Commerce Storefront

A modern, production-grade e-commerce front-end built with **HTML, CSS & vanilla JavaScript** and designed to run in front of a **Python (FastAPI) + MySQL** backend inside a **Kubernetes-orchestrated DevOps** environment.

The storefront ships with a built-in **mock dataset** so the UI runs instantly even before the backend is booted. When the real service appears, the `API` layer automatically switches from mock data to live responses — no code changes required.

---

## ✨ Highlights

- **Customer storefront** — header with logo, category navigation, live search and a cart trigger with a live item-count badge; promotional hero; product grid with rating stars, price, stock counter and Add-to-Cart; slide-over cart drawer; complete order checkout flow.
- **Embedded Ops Telemetry Dashboard** — collapsible console at the top for inspecting the backend:
  - **System Health** — live green/red pill that polls `/readyz`, showing latency (ms) and MySQL connectivity.
  - **Build & Version** — Git commit SHA, container tag and environment name from `/api/v1/version`.
  - **Chaos Simulator** — one-click fault injection that forces HTTP 503, exercising the app's graceful error boundary (retry banner instead of a crash).
  - **Runtime Metrics** — simulated request counts, active DB connection pool, req/sec, uptime and a live sparkline, plus a link to `/metrics`.
- **API Integration Contract** — all calls use *relative* paths with automatic mock-JSON fallback.
- **Accessible & responsive** — semantic markup, ARIA states, focus-visible rings, skip-link, keyboard shortcuts, reduced-motion support, mobile → tablet → widescreen layouts.
- **Toast notifications** for every user action.

---

## 🚀 Quick start

The storefront itself is pure static (no build step), but the repo ships a **Vite dev server** at the project root so you get a real origin, path-based API proxying, and the familiar `http://localhost:5173/` URL.

> **Repo layout** — `package.json`, `vite.config.js` and `node_modules/` live at the project root; the app (`index.html`, `css/`, `js/`) lives in `frontend/`. Vite is configured with `root: "frontend"`, so it serves the app directly.

### Recommended — Vite dev server

Run these **from the project root** (the folder that contains `package.json`):

```bash
npm install     # first time only
npm run dev     # → http://localhost:5173/
```

`vite.config.js` proxies `/api`, `/readyz` and `/metrics` to the FastAPI backend at `http://127.0.0.1:8000`. If the backend isn't running yet, the proxy calls fail and the frontend's **mock fallback** takes over automatically — so the storefront always renders.

```bash
npm run build     # production build → frontend/dist/
npm run preview   # serve the built output
```

### Alternative — no tooling at all

```bash
# 1) open the file directly (works over file:// thanks to the mock fallback)
open frontend/index.html          # macOS
start frontend\index.html         # Windows

# 2) or serve the static folder with any server
cd frontend && python -m http.server 8080
```

### Accessing the dev server

| From | URL |
|---|---|
| Windows browser | `http://localhost:5173/` |
| Browser inside WSL | `http://127.0.0.1:5173/` |
| Another device on the LAN | `http://<wsl-ip>:5173/` (find it with `hostname -I`) |

> **WSL note** — the dev server binds to `0.0.0.0` (not `127.0.0.1`) so Windows and WSL can both reach it. If you install from Windows and hit `UNC paths are not supported`, run `npm install`/`npm run dev` **inside WSL** — the project lives on the Linux filesystem.

### Production / Kubernetes

Serve the `frontend/` folder (or the `frontend/dist/` build) from FastAPI or an nginx ingress at the origin root. The app calls relative endpoints, so no CORS or URL config is needed:

| File | Route |
|---|---|
| `index.html` | `/` |
| `css/`, `js/` | `/css/*`, `/js/*` |
| `/api/*`, `/readyz`, `/metrics` | FastAPI backend |

---

## 🧩 API Integration Contract

All endpoints are **relative** to the serving origin. If a call fails (network error, timeout, non-2xx), the app transparently serves the built-in mock JSON. The `Chaos Simulator` switches this behavior to **propagate** the failure, so the error boundary can be demonstrated.

| Method | Path | Purpose | Notes |
|---|---|---|---|
| `GET` | `/api/v1/products` | Product list | Optional `?category=` and `?q=` filters |
| `GET` | `/api/v1/products/{id}` | Single product detail | |
| `POST` | `/api/v1/orders` | Place an order | JSON body → `{ customer, items, total }` |
| `GET` | `/readyz` | Liveness/readiness probe | Returns status + DB connectivity + latency |
| `GET` | `/api/v1/version` | Build metadata | `gitCommit`, `containerTag`, `environment`, … |
| `GET` | `/metrics` | Prometheus metrics endpoint | Linked from the ops console |

### Expected payload shapes (also encoded in `js/data.js` as mocks)

```jsonc
// GET /api/v1/products → { items: [...] }
{
  "items": [
    {
      "id": "sha-audio-001",
      "name": "Aurora Noise-Cancelling Headphones",
      "category": "audio",
      "price": 249.0,
      "oldPrice": 329.0,
      "rating": 4.8,
      "reviews": 1284,
      "stock": 18,
      "description": "…",
      "image": "https://…/640/480",
      "promo": true
    }
  ],
  "total": 14
}

// POST /api/v1/orders → 201
{
  "id": "ord_ABC123",
  "status": "confirmed",
  "createdAt": "2026-10-10T10:00:00Z",
  "total": 128.99,
  "eta": "2 business days"
}

// GET /readyz → 200
{
  "status": "ok",
  "database": {
    "connected": true,
    "driver": "aiomysql",
    "pool": { "active": 3, "idle": 5, "size": 8 },
    "latencyMs": 1.4
  }
}

// GET /api/v1/version → 200
{
  "app": "SHAMart API",
  "apiVersion": "v1",
  "gitCommit": "9f3c1a7e4b2d8c0f5a6e91b3d7c248af0e5b6d91",
  "shortSha": "9f3c1a7",
  "containerTag": "shamart-api:2026.10.3-rc4",
  "environment": "staging-eu-west-1",
  "buildTime": "2026-10-10T08:42:11Z"
}
```

---

## 📁 Project structure

```
cloudmart2/                    # project root
├── package.json               # Vite dev server scripts + dependency
├── vite.config.js             # root:"frontend", port 5173, /api · /readyz · /metrics proxy
└── frontend/                  # ← the app (static)
    ├── index.html             # Single-page shell: ops console, header, hero, catalog,
    │                          #   cart drawer, checkout & success modals, toasts
    ├── css/
    │   └── styles.css         # Design system (slate + #0284c7), layouts, components,
    │                          #   responsive breakpoints, reduced-motion rules
    └── js/
        ├── data.js            # Mock fallback dataset: products, categories, /readyz,
        │                      #   /version, /metrics payloads
        ├── api.js             # API layer: relative routes, timeouts, live→mock fallback,
        │                      #   chaos injection (forces 503)
        ├── store.js           # Cart state: pub/sub, stock caps, localStorage persistence
        ├── toast.js           # Accessible toast notifications
        ├── ui.js              # Rendering: product cards, cart, skeletons, error boundary
        ├── ops.js             # Ops telemetry console: /readyz polling, /version, metrics,
        │                      #   sparkline, chaos switch
        └── app.js             # Orchestration: boot, search, filters, checkout, wiring
```

> **Why classic scripts instead of ES modules?** Scripts with a shared `window.SHAMart` namespace work over `file://`, need no bundler, and download/execute in order — ideal for a zero-build DevOps demo. Vite just serves the static folder and proxies the API; it does not transform the app source.

---

## 🧪 How to demo it to an interviewer

1. **Open the page** with the backend still down → the product grid loads from mock data, the health pill turns amber **"Backend offline"**, build info shows the mock git SHA/env, and a toast explains the UI is running on offline data.
2. **Boot the backend** → click **Poll now** (or wait 10s): the pill turns green **"Operational"**, `/readyz` latency fills in, and data source switches from *mock fallback* to *live backend*.
3. **Flip the Chaos Simulator** → the API begins returning **503 Service Unavailable**; the storefront shows the amber **error boundary with Retry** instead of crashing, the health pill turns red **"Fault injected (503)"**, and checkout failures surface a friendly inline warning.
4. **Disable chaos** → the catalog automatically reloads and the boundary clears.

---

## ☸️ Kubernetes deployment notes

The frontend is fully static and stateless — bundle it into an nginx image and expose it alongside the API:

```dockerfile
# Dockerfile (frontend)
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
```

```yaml
# Deployment excerpt
containers:
  - name: shamart-web
    image: registry/shamart-web:<tag>
    ports: [{ containerPort: 80 }]
    livenessProbe:  { httpGet: { path: /readyz, port: 80 } }   # static files always ready
    resources:
      requests: { cpu: 50m, memory: 32Mi }
```

Route `/api/*` to the FastAPI `Service` and everything else to the web `Service` via the ingress, or expose both behind a single ingress host-anchored on paths. The client talks to same-origin relative URLs, so no Service Account / ConfigMap wiring is needed on the frontend side.

---

## ⌨️ Accessibility & UX

- Skip-to-content link, `aria-label`s on icon buttons, `role="dialog"` on drawer/modals, `aria-live` regions for toasts, grid and cart.
- Keyboard: `Esc` closes drawer/modals, `/` focuses the search box.
- Cart persists across reloads (localStorage); stock limits are enforced client-side.
- `prefers-reduced-motion` disables animations/transitions.

---

## 📌 Roadmap / possible extensions

- Product detail modal powered by `GET /api/v1/products/{id}` (already wired to a toast preview).
- User accounts + JWT session integration.
- Live stock decrement on order confirmation from the backend.
- Real Prometheus scraping endpoint for the `/metrics` sparkline.