import { resolveExifToolWasmUrl } from "./exif-write-runtime.mjs";
import { ExifToolJsonRecord } from "./metadata/schema";

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

export const EXIF_WRITE_TIMEOUT_MS = 120_000;

const createExifToolWorker = () =>
  new Worker(new URL("./exif-write.worker.ts", import.meta.url), {
    type: "module",
    name: "exif-metadata-worker",
  });

export function readMetadataInWorker(
  file: File,
  onPhase?: (phase: ExifWritePhase) => void,
): Promise<ExifToolReadResult> {
  return new Promise((resolve) => {
    const worker = createExifToolWorker();
    let settled = false;

    const finish = (result: ExifToolReadResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      worker.terminate();
      resolve(result);
    };

    const timeout = window.setTimeout(() => {
      finish({ success: false, error: "EXIF_WRITE_TIMEOUT" });
    }, EXIF_WRITE_TIMEOUT_MS);

    worker.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
      if (event.data.type === "phase") {
        onPhase?.(event.data.phase);
        return;
      }
      if (event.data.type === "metadata") {
        finish(event.data);
        return;
      }
      if (!event.data.success) finish(event.data);
    });

    worker.addEventListener("error", (event) => {
      finish({ success: false, error: event.message || "ExifTool worker failed" });
    });

    worker.postMessage({
      type: "read",
      file,
      wasmUrl: resolveExifToolWasmUrl(document.baseURI),
    });
  });
}

export function writeMetadataInWorker(
  file: File,
  tags: Record<string, ExifTagValue>,
  args: string[] = [],
  onPhase?: (phase: ExifWritePhase) => void,
): Promise<ExifWriteResult> {
  return new Promise((resolve) => {
    const worker = createExifToolWorker();
    let settled = false;

    const finish = (result: ExifWriteResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      worker.terminate();
      resolve(result);
    };

    const timeout = window.setTimeout(() => {
      finish({ success: false, error: "EXIF_WRITE_TIMEOUT" });
    }, EXIF_WRITE_TIMEOUT_MS);

    worker.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
      if (event.data.type === "phase") {
        onPhase?.(event.data.phase);
        return;
      }
      if (event.data.type === "result") finish(event.data);
    });

    worker.addEventListener("error", (event) => {
      finish({ success: false, error: event.message || "ExifTool worker failed" });
    });

    worker.postMessage({
      type: "write",
      file,
      tags,
      args,
      wasmUrl: resolveExifToolWasmUrl(document.baseURI),
    });
  });
}
