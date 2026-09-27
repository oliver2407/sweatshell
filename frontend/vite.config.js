import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Proxy so the dashboard talks to /api on its own origin. One less thing to
    // reconfigure when the demo moves from a laptop to a phone on the venue wifi.
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
  // `vite preview` does not inherit server.proxy, and preview is what we use to
  // check the built bundle against the real backend.
  preview: {
    port: 4173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
