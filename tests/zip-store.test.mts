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

test("ZIP names remain unique when real filenames already contain duplicate suffixes", async () => {
  const names = ["photo.jpg", "photo.jpg", "photo (1).jpg", "PHOTO.JPG", "photo (1).jpg"];
  const archive = await createStoredZip(names.map((name) => ({ name, file: new Blob([name]) })));
  const bytes = new Uint8Array(await archive.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let offset = 0;
  const actual: string[] = [];
  while (view.getUint32(offset, true) === 0x04034b50) {
    const length = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const size = view.getUint32(offset + 18, true);
    actual.push(new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + length)));
    offset += 30 + length + extraLength + size;
  }
  assert.equal(actual.length, names.length);
  assert.equal(new Set(actual.map((name) => name.toLowerCase())).size, names.length);
});
