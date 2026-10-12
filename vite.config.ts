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
    // Vite 8 build runs Rolldown; build.target alone left ??=/||= in the chunk
    // (jsc-verified on the Catalina engine class). Same pin as optimizeDeps.
    rolldownOptions: {
      transform: {
        target: "safari13",
      },
    } as never,
  },
  optimizeDeps: {
    // Vite 8 dep-optimizer runs Rolldown/oxc and IGNORES esbuildOptions (with a
    // deprecation warning). The Catalina webview (Safari-14-class) hard-crashes on
    // modern dep syntax (react-dom '=' class fields, pdf.js '#' private fields) —
    // black window. Lower the prebundle syntax the same way the build pins safari14.
    // ADR-0001 companion to esbuild/build targets below. Verified with jsc parse sweep.
    rolldownOptions: {
      transform: {
        target: "safari13", // safari14 still emits ??=/||= — the Catalina engine rejects them (jsc-verified); one notch lower
      },
    } as never, // typed as RolldownOptions; transform.target validated empirically
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
