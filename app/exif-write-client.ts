export type ExifWritePhase = "loading" | "writing";

type WorkerMessage =
  | { type: "phase"; phase: ExifWritePhase }
  | { type: "result"; success: true; data: ArrayBuffer }
  | { type: "result"; success: false; error: string };

export type ExifWriteResult =
  | { success: true; data: ArrayBuffer }
  | { success: false; error: string };

export const EXIF_WRITE_TIMEOUT_MS = 120_000;

export function writeMetadataInWorker(
  file: File,
  tags: Record<string, string | number>,
  onPhase?: (phase: ExifWritePhase) => void,
): Promise<ExifWriteResult> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./exif-write.worker.ts", import.meta.url), {
      type: "module",
      name: "exif-metadata-writer",
    });
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
      finish(event.data);
    });

    worker.addEventListener("error", (event) => {
      finish({ success: false, error: event.message || "ExifTool worker failed" });
    });

    worker.postMessage({ file, tags });
  });
}
