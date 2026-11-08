import assert from "node:assert/strict";
import test from "node:test";
import { readMetadataInWorker, writeMetadataInWorker } from "../app/exif-write-client";

test("worker failures settle, release resources and allow a fresh retry", async () => {
  const globals = globalThis as unknown as Record<string, unknown>;
  const previous = Object.fromEntries(["window", "document", "Worker"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  let mode = "read";
  let cleared = 0;
  let started = 0;
  let terminated = 0;
  let lastRequest: Record<string, unknown> = {};
  class FakeWorker extends EventTarget {
    constructor() { super(); started++; if (mode === "constructor") throw new Error("worker blocked"); }
    terminate() { terminated++; }
    postMessage(request: Record<string, unknown>) {
      lastRequest = request;
      if (mode === "post") throw new Error("could not clone input");
      queueMicrotask(() => {
        if (mode === "messageerror") { this.dispatchEvent(new Event("messageerror")); return; }
        const data = request.type === "read" ? { type:"metadata", success:true, data:{"IFD0:Make":"SONY"} } : {type:"result",success:true,data:new ArrayBuffer(2)};
        this.dispatchEvent(new MessageEvent("message", { data }));
      });
    }
  }
  globals.window = { setTimeout: () => 1, clearTimeout: () => { cleared++; } };
  globals.document = { baseURI: "http://localhost/EXIF-Editor/" };
  globals.Worker = FakeWorker;
  try {
    const file = new File([], "sample.jpg");
    for (mode of ["constructor", "post", "messageerror"]) {
      const result = await readMetadataInWorker(file);
      assert.equal(result.success, false);
    }
    mode = "read";
    assert.equal((await readMetadataInWorker(file, undefined, { numeric: true })).success, true);
    assert.equal(lastRequest.numeric, true);
    assert.equal(lastRequest.wasmUrl, "http://localhost/EXIF-Editor/zeroperl.wasm");
    assert.equal((await writeMetadataInWorker(file, {Make:"SONY"})).success, true);
    assert.equal(started, 5);
    assert.equal(terminated, 4);
    assert.equal(cleared, 4);
  } finally {
    for (const [name, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globals[name];
    }
  }
});
