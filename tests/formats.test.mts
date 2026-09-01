import assert from "node:assert/strict";
import test from "node:test";

import { imageDataPayload, imageFormatFromFile } from "../app/metadata/formats";

const bytes = (...values: number[]) => new Uint8Array(values).buffer;

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

test("uses WebP visual chunks while excluding metadata chunks", () => {
  const webp = bytes(
    82, 73, 70, 70, 30, 0, 0, 0, 87, 69, 66, 80,
    86, 80, 56, 32, 2, 0, 0, 0, 1, 2,
    88, 77, 80, 32, 2, 0, 0, 0, 3, 4,
  );
  assert.deepEqual([...imageDataPayload(webp, "webp")], [86, 80, 56, 32, 2, 0, 0, 0, 1, 2]);
});
