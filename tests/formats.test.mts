import assert from "node:assert/strict";
import test from "node:test";

import {
  imageDataPayload,
  imageFormatFromFile,
  normalizePngUtf8TextChunks,
} from "../app/metadata/formats";

const bytes = (...values: number[]) => new Uint8Array(values).buffer;

const pngChunk = (type: string, data: Uint8Array): number[] => [
  0,
  0,
  0,
  data.length,
  ...[...type].map((character) => character.charCodeAt(0)),
  ...data,
  0,
  0,
  0,
  0,
];

test("detects JPEG, PNG, and WebP by MIME type or extension", () => {
  assert.equal(imageFormatFromFile({ name: "photo.JPG", type: "" })?.format, "jpeg");
  assert.equal(imageFormatFromFile({ name: "photo", type: "image/png" })?.extension, "png");
  assert.equal(imageFormatFromFile({ name: "photo.webp", type: "" })?.mimeType, "image/webp");
  assert.equal(imageFormatFromFile({ name: "photo.heic", type: "image/heic" }), null);
});

test("uses only PNG IDAT chunks for image-data verification", () => {
  const png = bytes(
    137, 80, 78, 71, 13, 10, 26, 10,
    0, 0, 0, 2, 73, 68, 65, 84, 1, 2, 0, 0, 0, 0,
    0, 0, 0, 1, 116, 69, 88, 116, 3, 0, 0, 0, 0,
    0, 0, 0, 1, 73, 68, 65, 84, 4, 0, 0, 0, 0,
  );
  assert.deepEqual([...imageDataPayload(png, "png")], [73, 68, 65, 84, 1, 2, 73, 68, 65, 84, 4]);
});

test("ignores JPEG metadata when marker fill bytes precede a segment", () => {
  const jpeg = bytes(
    0xff, 0xd8,
    0xff, 0xff, 0xe1, 0, 4, 1, 2,
    0xff, 0xda, 0, 0, 2,
    3, 4, 0xff, 0xd9,
  );
  assert.deepEqual([...imageDataPayload(jpeg, "jpeg")], [0xff, 0xda, 0, 0, 2, 3, 4, 0xff, 0xd9]);
});

test("converts every PNG tEXt chunk to iTXt without changing IDAT", () => {
  const source = bytes(
    137, 80, 78, 71, 13, 10, 26, 10,
    ...pngChunk("tEXt", new TextEncoder().encode("Description\0中文提示词")),
    ...pngChunk("tEXt", new TextEncoder().encode("Author\0eskimolan")),
    ...pngChunk("IDAT", new Uint8Array([1, 2, 3])),
    ...pngChunk("IEND", new Uint8Array()),
  );
  const normalized = normalizePngUtf8TextChunks(source);
  assert.ok(normalized);
  assert.deepEqual(
    [...imageDataPayload(normalized.slice().buffer as ArrayBuffer, "png")],
    [73, 68, 65, 84, 1, 2, 3],
  );
  assert.equal((new TextDecoder().decode(normalized).match(/iTXt/g) ?? []).length, 2);
});

test("uses WebP bitstream chunks while excluding metadata and VP8X flags", () => {
  const webp = bytes(
    82, 73, 70, 70, 30, 0, 0, 0, 87, 69, 66, 80,
    86, 80, 56, 88, 2, 0, 0, 0, 9, 9,
    86, 80, 56, 32, 2, 0, 0, 0, 1, 2,
    88, 77, 80, 32, 2, 0, 0, 0, 3, 4,
  );
  assert.deepEqual([...imageDataPayload(webp, "webp")], [86, 80, 56, 32, 2, 0, 0, 0, 1, 2]);
});
