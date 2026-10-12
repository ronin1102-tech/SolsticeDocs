import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// Catalina constraint (macOS 10.15.7 build machine): WKWebView is Safari-14.1-class.
// Vite 8's default target ("baseline-widely-available") is safari16.4 — its output
// does not parse in the Catalina webview and the app renders a blank white window.
// Pin every esbuild path to safari14. Remove when 10.15 support is dropped.
const CATALINA_TARGET = "safari14";

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],

  // Catalina: see CATALINA_TARGET above
  esbuild: {
    target: CATALINA_TARGET,
  },
  build: {
    target: CATALINA_TARGET,
    cssTarget: CATALINA_TARGET,
  },
  optimizeDeps: {
    esbuildOptions: {
      target: CATALINA_TARGET,
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
