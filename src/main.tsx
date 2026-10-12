// Builtin polyfills FIRST — the Catalina engine (Safari-14.1 class) lacks
// .at(), Object.hasOwn, structuredClone; pdf.js legacy ships core-js shims but
// bundler tree-shaking drops them (side-effect-only imports). Explicit imports
// survive shaking. Must precede every other import.
import "core-js/actual/array/at";
import "core-js/actual/object/has-own";
import "core-js/actual/structured-clone";

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
