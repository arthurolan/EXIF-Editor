import assert from "node:assert/strict";
import test from "node:test";

import {
  deletedMetadataIsAbsent,
  isGpsMetadataField,
  privacySerialDeletionTags,
  remainingDeletionTargets,
} from "../app/metadata/clean";
import { ADVANCED_DELETE_TAGS, normalizeExifToolFields } from "../app/metadata/schema";
import {
  semanticConflicts,
  semanticValueFromFields,
  semanticWriteTags,
} from "../app/metadata/semantic";

const labels = {
  artist: "Artist",
  copyright: "Copyright",
  title: "Title",
  description: "Description",
  keywords: "Keywords",
  dateTime: "Date taken",
  make: "Make",
  model: "Model",
  lensModel: "Lens model",
  city: "City",
  country: "Country",
} as const;

test("normalizes ExifTool groups and preserves list values", () => {
  const fields = normalizeExifToolFields({
    "EXIF:Artist": "Alice",
    "XMP-dc:Subject": ["travel", "Shanghai"],
    "MakerNotes:SerialNumber": "12345",
    "ICC_Profile:ProfileDescription": "Display P3",
    "JUMBF:Manifest": "credential",
  });

  assert.equal(fields.find((field) => field.key === "XMP-dc:Subject")?.value, "travel, Shanghai");
  assert.equal(fields.find((field) => field.key === "MakerNotes:SerialNumber")?.group, "MakerNotes");
  assert.equal(fields.find((field) => field.key === "ICC_Profile:ProfileDescription")?.group, "ICC");
  assert.equal(fields.find((field) => field.key === "JUMBF:Manifest")?.group, "C2PA");
});

test("detects semantic conflicts and uses the first mapped value", () => {
  const fields = normalizeExifToolFields({
    "EXIF:Artist": "Alice",
    "XMP-dc:Creator": "Bob",
    "IPTC:By-line": "Alice",
  });

  assert.equal(semanticValueFromFields(fields, "artist"), "Alice");
  assert.deepEqual(semanticConflicts(fields, labels), [
    {
      key: "artist",
      label: "Artist",
      values: [
        { tag: "EXIF:Artist", value: "Alice" },
        { tag: "XMP-dc:Creator", value: "Bob" },
        { tag: "IPTC:By-line", value: "Alice" },
      ],
    },
  ]);
});

test("writes semantic fields to every compatible tag and splits keywords", () => {
  assert.deepEqual(semanticWriteTags("artist", "Alice"), {
    "EXIF:Artist": "Alice",
    "XMP-dc:Creator": "Alice",
    "IPTC:By-line": "Alice",
  });
  assert.deepEqual(semanticWriteTags("keywords", " travel, Shanghai ,, film "), {
    "XMP-dc:Subject": ["travel", "Shanghai", "film"],
    "IPTC:Keywords": ["travel", "Shanghai", "film"],
  });
});

test("verifies group and individual metadata cleanup without treating File data as removable", () => {
  const cleanOutput = normalizeExifToolFields({
    "File:FileType": "JPEG",
    "Composite:ImageSize": "4000x3000",
  });
  assert.equal(deletedMetadataIsAbsent(cleanOutput, ["GPS:All", "MakerNotes:All", "All"]), true);

  const leakedOutput = normalizeExifToolFields({
    "File:FileType": "JPEG",
    "GPS:GPSLatitude": "31.2",
    "MakerNotes:SerialNumber": "12345",
  });
  assert.equal(deletedMetadataIsAbsent(leakedOutput, ["GPS:All"]), false);
  assert.equal(deletedMetadataIsAbsent(leakedOutput, ["MakerNotes:All"]), false);
  assert.equal(deletedMetadataIsAbsent(leakedOutput, ["SerialNumber"]), false);
  assert.equal(deletedMetadataIsAbsent(leakedOutput, ["MakerNotes:SerialNumber"]), false);
  assert.deepEqual(remainingDeletionTargets(leakedOutput, ["GPS:All", "SerialNumber"]), [
    "GPS:All",
    "SerialNumber",
  ]);
});

test("removes and verifies GPS from EXIF and XMP, but ignores derived Composite values", () => {
  const fields = normalizeExifToolFields({
    "GPS:GPSLatitude": "31.2",
    "EXIF:GPSLongitude": "121.5",
    "XMP-exif:GPSAltitude": "12",
    "Composite:GPSPosition": "31.2, 121.5",
  });
  assert.deepEqual(
    fields.filter(isGpsMetadataField).map((field) => field.key),
    ["EXIF:GPSLongitude", "GPS:GPSLatitude", "XMP-exif:GPSAltitude"],
  );
  assert.deepEqual(remainingDeletionTargets(fields, ["GPS:All"]), ["GPS:All"]);
});

test("uses safe privacy serial deletes and falls back to group deletion for read-only XMP", () => {
  const fields = normalizeExifToolFields({
    "EXIF:SerialNumber": "camera-123",
    "XMP-exif:SerialNumber": "read-only-alias",
    "MakerNotes:SerialNumber": "maker-123",
  });
  assert.deepEqual(privacySerialDeletionTags(fields), [
    "EXIF:SerialNumber",
    "MakerNotes:All",
    "XMP:All",
  ]);
});

test("exposes every planned advanced deletion target", () => {
  assert.deepEqual(ADVANCED_DELETE_TAGS, [
    "EXIF:All",
    "GPS:All",
    "XMP:All",
    "IPTC:All",
    "MakerNotes:All",
    "ICC_Profile:All",
    "Photoshop:All",
    "ThumbnailImage",
    "PreviewImage",
    "JUMBF:All",
  ]);
});
