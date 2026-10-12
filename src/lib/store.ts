// Session persistence + QA event tap.
//
// BROWSER DEV MODE (ADR-0001): the native side writes document state and
// annotations to SQLite (Phase 2 core, durable). In Chrome the same calls land
// in localStorage under a versioned key AND are mirrored to /__qa for the
// Playwright evidence pass — so "annotations survive relaunch" is testable now;
// the SQLite round-trip swaps in behind this module (ipc.addAnnotation) once
// the sidecar exists. Phase 3-WRITE then persists identically in both modes.

export interface StoredAnnotation {
  id: number;
  page: number;
  type: string; // highlight | underline
  color: string;
  rects: number[][]; // page-local PDF units [x, y, w, h]
}

export interface Session {
  filePath: string;
  hash: string;
  title: string;
  lastPage: number;
  zoom: number;
  annotations: StoredAnnotation[];
}

const LS_KEY = "solsticedocs.session.v1";
export const QA = new URLSearchParams(location.search).has("qa");

export function qaPost(kind: string, payload: Record<string, unknown>): void {
  if (!QA) return;
  fetch("/__qa", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, ...payload, t: Date.now() }),
  }).catch(() => {});
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* quota — non-fatal */
  }
  qaPost("session", { lastPage: s.lastPage, zoom: s.zoom, annotations: s.annotations.length });
}

export function clearSession(): void {
  localStorage.removeItem(LS_KEY);
  qaPost("cleared", {});
}
