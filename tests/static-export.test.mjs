import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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
