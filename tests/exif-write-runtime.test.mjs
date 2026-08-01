import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchVerifiedExifToolWasm,
  resolveExifToolWasmUrl,
} from "../app/exif-write-runtime.mjs";

test("resolves WASM at a root deployment", () => {
  assert.equal(
    resolveExifToolWasmUrl("https://example.com/"),
    "https://example.com/zeroperl.wasm",
  );
});

test("preserves a GitHub Pages repository base path", () => {
  assert.equal(
    resolveExifToolWasmUrl("https://example.github.io/EXIF-Editor/"),
    "https://example.github.io/EXIF-Editor/zeroperl.wasm",
  );
});

test("accepts a response with the WebAssembly magic signature", async () => {
  const response = await fetchVerifiedExifToolWasm("https://example.com/zeroperl.wasm", async () =>
    new Response(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])),
  );
  assert.equal(response.headers.get("content-type"), "application/wasm");
  assert.deepEqual(
    [...new Uint8Array(await response.arrayBuffer())],
    [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00],
  );
});

test("rejects an HTML fallback before WebAssembly.instantiate", async () => {
  await assert.rejects(
    fetchVerifiedExifToolWasm("https://example.com/zeroperl.wasm", async () =>
      new Response("<!DOCTYPE html>", { status: 200, headers: { "content-type": "text/html" } }),
    ),
    /EXIF_WASM_INVALID_CONTENT/,
  );
});

test("reports an HTTP failure with its status", async () => {
  await assert.rejects(
    fetchVerifiedExifToolWasm("https://example.com/zeroperl.wasm", async () =>
      new Response("missing", { status: 404 }),
    ),
    /EXIF_WASM_HTTP_404/,
  );
});
