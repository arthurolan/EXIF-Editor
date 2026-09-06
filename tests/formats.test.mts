import assert from "node:assert/strict";
import test from "node:test";

import {
  imageDataPayload,
  imageFormatFromFile,
  formatSafetyFromBuffer,
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

test("detects stable and experimental formats by MIME type or extension", () => {
  assert.equal(imageFormatFromFile({ name: "photo.JPG", type: "" })?.format, "jpeg");
  assert.equal(imageFormatFromFile({ name: "photo", type: "image/png" })?.extension, "png");
  assert.equal(imageFormatFromFile({ name: "photo.webp", type: "" })?.mimeType, "image/webp");
  assert.equal(imageFormatFromFile({ name: "scan.tiff", type: "" })?.format, "tiff");
  assert.equal(imageFormatFromFile({ name: "photo.heif", type: "image/heif" })?.format, "heic");
});

const classicTiff = (nextIfd = 0): ArrayBuffer => {
  const bytes = new Uint8Array(45);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49]);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 2, true);
  view.setUint16(10, 273, true); // StripOffsets
  view.setUint16(12, 4, true);
  view.setUint32(14, 1, true);
  view.setUint32(18, 42, true);
  view.setUint16(22, 279, true); // StripByteCounts
  view.setUint16(24, 4, true);
  view.setUint32(26, 1, true);
  view.setUint32(30, 3, true);
  view.setUint32(34, nextIfd, true);
  bytes.set([1, 2, 3], 42);
  return bytes.buffer;
};

const heic = (): ArrayBuffer => bytes(
  0, 0, 0, 20, 102, 116, 121, 112, 104, 101, 105, 99, 0, 0, 0, 0, 109, 105, 102, 49,
  0, 0, 0, 12, 109, 100, 97, 116, 1, 2, 3, 4,
);

test("uses TIFF strips for conservative image-data verification and blocks multiple pages", () => {
  const source = classicTiff();
  assert.deepEqual([...imageDataPayload(source, "tiff")], [1, 2, 3]);
  assert.deepEqual(formatSafetyFromBuffer(source, "tiff"), { writable: true });
  assert.equal(formatSafetyFromBuffer(classicTiff(40), "tiff").writable, false);
  assert.equal(formatSafetyFromBuffer(bytes(0x49, 0x49, 43, 0, 0, 0, 0, 0), "tiff").writable, false);
});

test("uses HEIC/HEIF mdat data for conservative verification", () => {
  assert.deepEqual([...imageDataPayload(heic(), "heic")], [1, 2, 3, 4]);
  assert.deepEqual(formatSafetyFromBuffer(heic(), "heic"), { writable: true });
  assert.equal(formatSafetyFromBuffer(bytes(0, 0, 0, 12, 102, 116, 121, 112, 109, 112, 52, 50), "heic").writable, false);
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

test("ignores optional fill bytes immediately before a JPEG scan", () => {
  const jpeg = bytes(
    0xff, 0xd8,
    0xff, 0xff, 0xda, 0, 2,
    3, 4, 0xff, 0xd9,
  );
  assert.deepEqual([...imageDataPayload(jpeg, "jpeg")], [0xff, 0xda, 0, 2, 3, 4, 0xff, 0xd9]);
});

test("ignores JPEG data appended after the primary image ends", () => {
  const jpeg = bytes(
    0xff, 0xd8,
    0xff, 0xda, 0, 2,
    3, 4, 0xff, 0xd9,
    0xff, 0xe1, 0, 4, 5, 6,
  );
  assert.deepEqual([...imageDataPayload(jpeg, "jpeg")], [0xff, 0xda, 0, 2, 3, 4, 0xff, 0xd9]);
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
