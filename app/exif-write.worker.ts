/// <reference lib="webworker" />

type WriteRequest = {
  file: File;
  tags: Record<string, string | number>;
};

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

workerScope.addEventListener("message", async (event: MessageEvent<WriteRequest>) => {
  try {
    workerScope.postMessage({ type: "phase", phase: "loading" });
    const { dispose, writeMetadata } = await import("@uswriting/exiftool");
    workerScope.postMessage({ type: "phase", phase: "writing" });

    try {
      const result = await writeMetadata(event.data.file, event.data.tags, { args: ["-m"] });
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
