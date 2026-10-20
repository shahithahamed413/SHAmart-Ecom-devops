import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// SHAMart dev server.
// - root      → serves the static frontend/ folder (index.html lives there)
// - server.*  → binds 127.0.0.1:5173 so the storefront can be opened at
//               http://localhost:5173/
// - proxy     → forwards API traffic to the FastAPI backend once it's running
//               (default 127.0.0.1:8000). When the backend is down, the
//               frontend's mock fallback kicks in automatically.
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  base: "./",
  plugins: [],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    open: false,
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/readyz": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/metrics": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
  },
});