/// <reference lib="webworker" />

import { fetchVerifiedExifToolWasm } from "./exif-write-runtime.mjs";

type ExifTagValue = string | number | boolean | (string | number | boolean)[];

type WriteRequest = {
  type: "write";
  file: File;
  tags: Record<string, ExifTagValue>;
  args: string[];
  wasmUrl: string;
};

type ReadRequest = {
  type: "read";
  file: File;
  wasmUrl: string;
};

type WorkerRequest = ReadRequest | WriteRequest;

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

// Zeroperl currently distinguishes browser and Node runtimes by checking for
// both `window` and `document`. A dedicated worker is a browser runtime without
// those aliases, so provide inert shims before the dynamic import to keep WASM
// loading on the fetch path.
if (!("window" in workerScope)) {
  Object.defineProperty(workerScope, "window", { value: workerScope });
}
if (!("document" in workerScope)) {
  Object.defineProperty(workerScope, "document", { value: {} });
}

workerScope.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  try {
    workerScope.postMessage({ type: "phase", phase: "loading" });
    const { dispose, parseMetadata, writeMetadata } = await import("@uswriting/exiftool");

    try {
      if (event.data.type === "read") {
        const result = await parseMetadata<Record<string, unknown>[]>(event.data.file, {
          args: ["-json", "-G1", "-a", "-s"],
          fetch: () => fetchVerifiedExifToolWasm(event.data.wasmUrl),
          transform: (data) => JSON.parse(data) as Record<string, unknown>[],
        });
        if (!result.success) {
          workerScope.postMessage({
            type: "result",
            success: false,
            error: result.error,
          });
          return;
        }
        if (!result.data?.[0]) {
          workerScope.postMessage({
            type: "result",
            success: false,
            error: "ExifTool could not read the metadata",
          });
          return;
        }
        workerScope.postMessage({
          type: "metadata",
          success: true,
          data: result.data[0],
        });
        return;
      }

      workerScope.postMessage({ type: "phase", phase: "writing" });
      const result = await writeMetadata(event.data.file, event.data.tags, {
        args: ["-m", ...event.data.args],
        fetch: () => fetchVerifiedExifToolWasm(event.data.wasmUrl),
      });
      if (!result.success || !result.data) {
        workerScope.postMessage({
          type: "result",
          success: false,
          error: result.error || "ExifTool could not write the metadata",
        });
        return;
      }

      workerScope.postMessage(
        { type: "result", success: true, data: result.data },
        [result.data],
      );
    } finally {
      await dispose();
    }
  } catch (cause) {
    workerScope.postMessage({
      type: "result",
      success: false,
      error: cause instanceof Error ? cause.message : "ExifTool worker failed",
    });
  }
});

export {};
