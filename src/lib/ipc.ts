// ADR-0001 IPC seam: the ONLY module allowed to talk to Tauri.
// In-app: native invoke. In browser (Chrome dev mode): HTTP shim to a local
// sidecar (Phase 3) — for now the shim reports UNSUPPORTED so calls fail loudly
// instead of silently doing nothing.
type Args = Record<string, unknown>;

const IN_TAURI =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

async function httpShim<T>(_cmd: string, _args: Args): Promise<T> {
  // Sidecar lands with the Phase 3 render work; fail loudly until then.
  throw new Error(
    `ipc: browser dev mode has no sidecar yet (ADR-0001); command "${_cmd}" unavailable`
  );
}

export async function invokeCmd<T>(cmd: string, args: Args = {}): Promise<T> {
  if (IN_TAURI) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  return httpShim<T>(cmd, args);
}

export interface DocState {
  id: number;
  file_path: string;
  hash_sha256: string;
  parent_hash: string | null;
  title: string;
  last_page: number;
  zoom: number;
}

export const ipc = {
  importDocument: (filePath: string, title: string) =>
    invokeCmd<DocState>("import_document", { filePath, title }),
  setReadingState: (docHash: string, lastPage: number, zoom: number) =>
    invokeCmd<null>("set_reading_state_cmd", { docHash, lastPage, zoom }),
  addAnnotation: (docHash: string, kind: string, coordinates: string, color: string, noteText: string, page: number) =>
    invokeCmd<number>("add_annotation_cmd", { docHash, kind, coordinates, color, noteText, page }),
  listAnnotations: (docHash: string) =>
    invokeCmd<unknown[]>("list_annotations_cmd", { docHash }),
  deleteAnnotation: (id: number) => invokeCmd<null>("delete_annotation_cmd", { id }),
  addCoursework: (folderName: string, semester: string, priority: number, parentId?: number) =>
    invokeCmd<number>("add_coursework_cmd", { folderName, semester, priority, parentId }),
  benchIpc: (samples?: number) => invokeCmd<{ samples: number; p50_us: number; p95_us: number }>("bench_ipc", { samples }),
};
