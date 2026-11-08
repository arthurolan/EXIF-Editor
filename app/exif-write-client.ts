import { resolveExifToolWasmUrl } from "./exif-write-runtime.mjs";
import type { ExifToolJsonRecord } from "./metadata/schema";

export type ExifWritePhase = "loading" | "writing";
export type ExifTagValue = string | number | boolean | (string | number | boolean)[];

type WorkerMessage =
  | { type: "phase"; phase: ExifWritePhase }
  | { type: "result"; success: true; data: ArrayBuffer }
  | { type: "metadata"; success: true; data: ExifToolJsonRecord }
  | { type: "result"; success: false; error: string };

export type ExifWriteResult =
  | { success: true; data: ArrayBuffer }
  | { success: false; error: string };

export type ExifToolReadResult =
  | { success: true; data: ExifToolJsonRecord }
  | { success: false; error: string };

// Large camera JPEGs can require several copies in the browser's WASM memory.
// Give local processing time to finish instead of failing at an arbitrary two-minute edge.
export const EXIF_WRITE_TIMEOUT_MS = 300_000;

const createExifToolWorker = () =>
  new Worker(new URL("./exif-write.worker.ts", import.meta.url), {
    type: "module",
    name: "exif-metadata-worker",
  });

type WorkerResult = ExifToolReadResult | ExifWriteResult;

function runWorker(
  request: { type: "read"; file: File; numeric: boolean } | { type: "write"; file: File; tags: Record<string, ExifTagValue>; args: string[] },
  onPhase?: (phase: ExifWritePhase) => void,
): Promise<WorkerResult> {
  return new Promise((resolve) => {
    let worker: Worker | undefined;
    let timeout: number | undefined;
    let settled = false;
    const finish = (result: WorkerResult) => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      worker?.terminate();
      resolve(result);
    };
    try {
      worker = createExifToolWorker();
      timeout = window.setTimeout(() => finish({ success: false, error: "EXIF_WRITE_TIMEOUT" }), EXIF_WRITE_TIMEOUT_MS);
      worker.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
        if (event.data.type === "phase") {
          onPhase?.(event.data.phase);
        } else if (!event.data.success || event.data.type === (request.type === "read" ? "metadata" : "result")) {
          finish(event.data);
        }
      });
      worker.addEventListener("error", (event) => finish({ success: false, error: event.message || "ExifTool worker failed" }));
      worker.addEventListener("messageerror", () => finish({ success: false, error: "ExifTool worker response could not be read" }));
      worker.postMessage({ ...request, wasmUrl: resolveExifToolWasmUrl(document.baseURI) });
    } catch (cause) {
      finish({ success: false, error: cause instanceof Error ? cause.message : "ExifTool worker could not start" });
    }
  });
}

export function readMetadataInWorker(
  file: File,
  onPhase?: (phase: ExifWritePhase) => void,
  options: { numeric?: boolean } = {},
): Promise<ExifToolReadResult> {
  return runWorker({ type: "read", file, numeric: options.numeric ?? false }, onPhase) as Promise<ExifToolReadResult>;
}

export function writeMetadataInWorker(
  file: File,
  tags: Record<string, ExifTagValue>,
  args: string[] = [],
  onPhase?: (phase: ExifWritePhase) => void,
): Promise<ExifWriteResult> {
  return runWorker({ type: "write", file, tags, args }, onPhase) as Promise<ExifWriteResult>;
}
