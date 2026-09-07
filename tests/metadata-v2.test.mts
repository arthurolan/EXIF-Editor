import assert from "node:assert/strict";
import test from "node:test";

import {
  deletedMetadataIsAbsent,
  gpsDeletionTags,
  isGpsMetadataField,
  isGpsLocationMetadataField,
  privacySerialDeletionTags,
  privacySerialDeletionTagsForPreset,
  remainingPrivacySerialFields,
  remainingDeletionTargets,
} from "../app/metadata/clean";
import { ADVANCED_DELETE_TAGS, normalizeExifToolFields } from "../app/metadata/schema";
import {
  semanticConflicts,
  semanticValueFromFields,
  semanticWriteTags,
} from "../app/metadata/semantic";
import { batchDeletionTags, batchTextEditsAreVerified, batchTextEditsForFormat, batchTextWriteTags, hasBatchTextEdits, unavailableBatchTextFields } from "../app/batch-processor";

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
    "ICC_Profile2:ProfileDescription": "Display P3 auxiliary",
    "JUMBF:Manifest": "credential",
  });

  assert.equal(fields.find((field) => field.key === "XMP-dc:Subject")?.value, "travel, Shanghai");
  assert.equal(fields.find((field) => field.key === "MakerNotes:SerialNumber")?.group, "MakerNotes");
  assert.equal(fields.find((field) => field.key === "ICC_Profile:ProfileDescription")?.group, "ICC");
  assert.equal(fields.find((field) => field.key === "ICC_Profile2:ProfileDescription")?.group, "ICC");
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

test("does not treat IPTC's separate date and time fields as a date conflict", () => {
  const fields = normalizeExifToolFields({
    "EXIF:DateTimeOriginal": "2023:05:29 18:47:00",
    "XMP-exif:DateTimeOriginal": "2023:05:29 18:47:00",
    "XMP-photoshop:DateCreated": "2023:05:29 18:47:00",
    "IPTC:DateCreated": "2023:05:29",
    "IPTC:TimeCreated": "18:47:00",
  });

  assert.equal(semanticConflicts(fields, labels).some((conflict) => conflict.key === "dateTime"), false);
});

test("does not treat IPTC's UTC time suffix as a date conflict", () => {
  const fields = normalizeExifToolFields({
    "EXIF:DateTimeOriginal": "2023:05:29 18:47:00",
    "XMP-exif:DateTimeOriginal": "2023:05:29 18:47:00",
    "IPTC:DateCreated": "2023:05:29",
    "IPTC:TimeCreated": "18:47:00+00:00",
  });

  assert.equal(semanticConflicts(fields, labels).some((conflict) => conflict.key === "dateTime"), false);
});

test("uses the namespaced EXIF author instead of an unrelated PNG text field", () => {
  const fields = normalizeExifToolFields({
    "EXIF:Artist": "Updated author",
    "PNG:Artist": "Old PNG text author",
  });

  assert.equal(semanticValueFromFields(fields, "artist"), "Updated author");
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
  assert.deepEqual(semanticWriteTags("dateTime", "2026:09:06 12:00:00"), {
    "EXIF:DateTimeOriginal": "2026:09:06 12:00:00",
    "XMP-exif:DateTimeOriginal": "2026:09:06 12:00:00",
    "XMP-photoshop:DateCreated": "2026:09:06 12:00:00",
    "IPTC:DateCreated": "2026:09:06",
    "IPTC:TimeCreated": "12:00:00",
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

test("expands GPS deletion to XMP and EXIF GPS aliases for non-JPEG containers", () => {
  const fields = normalizeExifToolFields({
    "GPS:GPSLatitude": "31.2",
    "GPS:GPSVersionID": "2.3.0.0",
    "EXIF:GPSLongitude": "121.5",
    "XMP-exif:GPSLatitude": "31.2",
    "Composite:GPSPosition": "31.2, 121.5",
  });

  assert.deepEqual(gpsDeletionTags(fields), [
    "GPS:All",
    "EXIF:GPSLongitude",
    "GPS:GPSLatitude",
    "GPS:GPSVersionID",
    "XMP-exif:GPSLatitude",
  ]);
});

test("does not treat a retained GPS version marker as a retained location", () => {
  const fields = normalizeExifToolFields({
    "GPS:GPSVersionID": "2.3.0.0",
    "GPS:GPSLatitude": "31.2",
  });
  assert.deepEqual(
    fields.filter(isGpsLocationMetadataField).map((field) => field.key),
    ["GPS:GPSLatitude"],
  );
});

test("does not fail GPS cleanup verification on a retained GPS version marker", () => {
  const fields = normalizeExifToolFields({
    "File:FileType": "WEBP",
    "GPS:GPSVersionID": "2.3.0.0",
  });

  assert.deepEqual(remainingDeletionTargets(fields, ["GPS:All"]), []);
  assert.equal(deletedMetadataIsAbsent(fields, ["GPS:All"]), true);
});

test("does not treat a retained GPS IFD pointer as a location", () => {
  const fields = normalizeExifToolFields({
    "EXIF:GPSInfo": 1234,
  });
  assert.equal(isGpsLocationMetadataField(fields[0]), false);
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

test("removes and verifies EXIF serial numbers reported through an ExifIFD namespace", () => {
  const fields = normalizeExifToolFields({
    "ExifIFD:BodySerialNumber": "03483086",
    "XMP-exifEX:LensSerialNumber": "lens-123",
    "Composite:SerialNumber": "derived-value",
  });
  assert.deepEqual(privacySerialDeletionTags(fields), ["ExifIFD:BodySerialNumber", "XMP:All"]);
  assert.deepEqual(
    remainingPrivacySerialFields(fields).map((field) => field.key),
    ["ExifIFD:BodySerialNumber", "XMP-exifEX:LensSerialNumber"],
  );
});

test("checks privacy serial deletions only for the privacy cleanup preset", () => {
  const fields = normalizeExifToolFields({
    "EXIF:SerialNumber": "camera-123",
    "XMP-exif:SerialNumber": "read-only-alias",
  });

  assert.deepEqual(privacySerialDeletionTagsForPreset(fields, "none"), []);
  assert.deepEqual(privacySerialDeletionTagsForPreset(fields, "privacy"), [
    "EXIF:SerialNumber",
    "XMP:All",
  ]);
});

test("builds isolated batch deletion operations without dropping XMP GPS aliases", () => {
  const fields = normalizeExifToolFields({
    "GPS:GPSLatitude": "31.2",
    "XMP-exif:GPSLongitude": "121.5",
    "EXIF:SerialNumber": "camera-123",
  });
  assert.deepEqual(batchDeletionTags(fields, "removeGps"), [
    "GPS:All",
    "GPS:GPSLatitude",
    "XMP-exif:GPSLongitude",
  ]);
  assert.deepEqual(batchDeletionTags(fields, "privacy"), [
    "GPS:All",
    "GPS:GPSLatitude",
    "XMP-exif:GPSLongitude",
    "Software",
    "ProcessingSoftware",
    "ThumbnailImage",
    "PreviewImage",
    "EXIF:SerialNumber",
  ]);
  assert.deepEqual(batchDeletionTags(fields, "metadata"), []);
});

test("builds synchronized batch text writes while leaving blank fields untouched", () => {
  const edits = { artist: "Alice", keywords: "travel, Shanghai", city: "" };
  assert.equal(hasBatchTextEdits(edits), true);
  assert.equal(hasBatchTextEdits({ city: "  " }), false);
  assert.deepEqual(batchTextWriteTags(edits), {
    "EXIF:Artist": "Alice",
    "XMP-dc:Creator": "Alice",
    "IPTC:By-line": "Alice",
    "XMP-dc:Subject": ["travel", "Shanghai"],
    "IPTC:Keywords": ["travel", "Shanghai"],
  });
  const written = normalizeExifToolFields({
    "EXIF:Artist": "Alice",
    "XMP-dc:Creator": "Alice",
    "IPTC:By-line": "Alice",
    "XMP-dc:Subject": ["travel", "Shanghai"],
    "IPTC:Keywords": ["travel", "Shanghai"],
  });
  assert.equal(batchTextEditsAreVerified(written, edits), true);
  assert.equal(batchTextEditsAreVerified(written, { artist: "Other" }), false);
});

test("preserves HEIC delivery when its compatible text fields verify", () => {
  const edits = { artist: "Alice", copyright: "© Alice", keywords: "travel", city: "Shanghai", country: "China" };
  assert.deepEqual(unavailableBatchTextFields("heic", edits), ["keywords", "city", "country"]);
  assert.deepEqual(batchTextEditsForFormat("heic", edits), { artist: "Alice", copyright: "© Alice" });
  assert.deepEqual(batchTextEditsForFormat("jpeg", edits), edits);
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
