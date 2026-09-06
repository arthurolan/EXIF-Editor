import assert from "node:assert/strict";
import test from "node:test";
import { createStoredZip } from "../app/zip-store";

test("creates one standards-compatible ZIP containing every verified output", async () => {
  const progress: number[] = [];
  const archive = await createStoredZip([
    { name: "first_edited.jpg", file: new Blob(["first"]) },
    { name: "second_edited.png", file: new Blob(["second"]) },
  ], (completed) => progress.push(completed));
  const bytes = new Uint8Array(await archive.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(archive.type, "application/zip");
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(bytes.length - 14, true), 2);
  assert.deepEqual(progress, [1, 2]);
  assert.match(new TextDecoder().decode(bytes), /first_edited\.jpg/);
  assert.match(new TextDecoder().decode(bytes), /second_edited\.png/);
});

test("disambiguates duplicate names inside a ZIP", async () => {
  const archive = await createStoredZip([
    { name: "photo_edited.jpg", file: new Blob(["one"]) },
    { name: "photo_edited.jpg", file: new Blob(["two"]) },
  ]);
  const text = new TextDecoder().decode(await archive.arrayBuffer());
  assert.match(text, /photo_edited\.jpg/);
  assert.match(text, /photo_edited \(1\)\.jpg/);
});
