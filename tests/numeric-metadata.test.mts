import assert from "node:assert/strict";
import test from "node:test";
import { numericFieldMatches, storedNumericValue } from "../app/metadata/numeric";
import { normalizeExifToolFields } from "../app/metadata/schema";

test("keeps stored rational precision for aperture and shutter verification", () => {
  assert.equal(storedNumericValue([5, 4]), "1.25");
  assert.equal(storedNumericValue([3, 20]), "0.15");
  assert.equal(storedNumericValue([3, 20], true), "3/20");
  assert.equal(storedNumericValue("3/20"), "0.15");
  assert.equal(storedNumericValue([200]), "200");
});

test("missing or invalid stored values cannot be mistaken for zero", () => {
  for (const value of [undefined, null, "", " ", [1, 0], NaN, Infinity, "f/5.6", []]) {
    assert.equal(storedNumericValue(value), null);
  }
  assert.equal(storedNumericValue(0), "0");
});

test("camera verification uses namespaced values and rejects stale secondary copies", () => {
  const fields = normalizeExifToolFields({ "ExifIFD:FNumber": 1.25, "PNG:FNumber": "old unrelated text", "ExifIFD:ExposureTime": 0.15 });
  assert.equal(numericFieldMatches(fields, "FNumber", "1.25"), true);
  assert.equal(numericFieldMatches(fields, "ExposureTime", "3/20"), true);
  assert.equal(numericFieldMatches(fields, "FNumber", "1.3"), false);
  assert.equal(numericFieldMatches(fields, "ISO", "100"), false);
  assert.equal(numericFieldMatches(fields, "ISO", ""), true);
  const stale = [...fields, ...normalizeExifToolFields({ "XMP-exif:FNumber": "2/1" })];
  assert.equal(numericFieldMatches(stale, "FNumber", "1.25"), false);
});
