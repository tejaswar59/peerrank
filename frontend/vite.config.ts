import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The FastAPI backend serves the built SPA from ../web at the /app/ path
// (StaticFiles mount in app/main.py). We build straight into that folder so
// there is ZERO backend change: same origin, same mount, same deploy.
export default defineConfig({
  plugins: [react()],
  base: "/app/",
  // `npm run dev` (hot reload) proxies API calls to the running FastAPI backend.
  // Start the backend on :8000, then open the Vite dev URL at /app/.
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL("../web", import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three", "@react-three/fiber", "@react-three/drei"],
          motion: ["framer-motion"],
          vendor: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
});
