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

const IN_TAURI =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

// Native branch: mirror the session into SQLite (documents + annotations).
// Browser branch: localStorage only. Same Session contract both sides.
async function nativeSync(s: Session): Promise<void> {
  const { ipc } = await import("./ipc");
  const doc = await ipc.importDocument(s.filePath, s.title);
  await ipc.setReadingState(doc.hash_sha256, s.lastPage, s.zoom);
  await ipc.clearAnnotations(doc.hash_sha256); // replace-all: JS ids are Date.now(), not DB ids
  for (const a of s.annotations) {
    await ipc.addAnnotation(
      doc.hash_sha256,
      a.type,
      JSON.stringify({ rects: a.rects }),
      a.color,
      "",
      a.page
    );
  }
}

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
  if (IN_TAURI) nativeSync(s).catch(() => {}); // durable best-effort; browser LS stays source of truth for restore
  qaPost("session", { lastPage: s.lastPage, zoom: s.zoom, annotations: s.annotations.length });
}

// Restore path: native mode prefers SQLite, falls back to LS.
export async function loadSessionAsync(): Promise<Session | null> {
  const ls = loadSession();
  if (!IN_TAURI) return ls;
  try {
    const { ipc } = await import("./ipc");
    const docs = await ipc.listDocuments();
    if (!docs.length) return ls;
    const doc = docs[0]; // shelf = most recent activity
    const rows = await ipc.listAnnotations(doc.hash_sha256);
    const annotations: StoredAnnotation[] = rows.map((r: any) => ({
      id: Number(r.id),
      page: Number(r.page),
      type: String(r.type),
      color: String(r.color),
      rects: JSON.parse(String(r.coordinates || "{}")).rects ?? [],
    }));
    return {
      filePath: doc.file_path,
      hash: doc.hash_sha256,
      title: doc.title,
      lastPage: doc.last_page,
      zoom: doc.zoom,
      annotations,
    };
  } catch {
    return ls;
  }
}

export function clearSession(): void {
  localStorage.removeItem(LS_KEY);
  qaPost("cleared", {});
}
