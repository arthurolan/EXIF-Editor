import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const outputRoot = new URL("../out/", import.meta.url);

test("exports a complete static GitHub Pages site", async () => {
  await Promise.all([
    access(new URL("index.html", outputRoot)),
    access(new URL("404.html", outputRoot)),
    access(new URL("og.png", outputRoot)),
    access(new URL("zeroperl.wasm", outputRoot)),
  ]);

  const html = await readFile(new URL("index.html", outputRoot), "utf8");
  assert.match(html, /影刻/);
  assert.match(html, /_next\/static\//);
  assert.doesNotMatch(html, /x-forwarded-host|signin-with-chatgpt/);
});

test("ships the keyless map provider and Apple Maps fallback", async () => {
  const chunksRoot = new URL("_next/static/chunks/", outputRoot);
  const chunkNames = await readdir(chunksRoot, { recursive: true });
  const javascriptChunks = chunkNames.filter((name) => name.endsWith(".js"));
  const source = (
    await Promise.all(
      javascriptChunks.map((name) => readFile(new URL(name, chunksRoot), "utf8")),
    )
  ).join("\n");

  assert.match(source, /tiles\.openfreemap\.org\/styles\/liberty/);
  assert.match(source, /maps\.apple\.com/);
  assert.match(source, /地图暂时无法载入/);
  assert.doesNotMatch(source, /tile\.openstreetmap\.org/);
});

test("resolves and validates the EXIF writer WASM from the deployed base path", async () => {
  const chunksRoot = new URL("_next/static/chunks/", outputRoot);
  const chunkNames = await readdir(chunksRoot, { recursive: true });
  const javascriptChunks = chunkNames.filter((name) => name.endsWith(".js"));
  const source = (
    await Promise.all(
      javascriptChunks.map((name) => readFile(new URL(name, chunksRoot), "utf8")),
    )
  ).join("\n");

  assert.match(source, /baseURI/);
  assert.match(source, /zeroperl\.wasm/);
  assert.match(source, /EXIF_WASM_INVALID_CONTENT/);
});
