import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dispose, parseMetadata, writeMetadata } from "@uswriting/exiftool";
import ExifReader from "exifreader";
import { writeMetadataInStages } from "../app/metadata/write-stages";
import { normalizeExifToolFields } from "../app/metadata/schema";
import { semanticValueFromFields, semanticValueMatches, semanticWriteTags } from "../app/metadata/semantic";
import { expandCleanupTargets, remainingDeletionTargets } from "../app/metadata/clean";
import { storedNumericValue } from "../app/metadata/numeric";
import { imageDataDigest, type SupportedImageFormat } from "../app/metadata/formats";
import type { ExifTagValue } from "../app/exif-write-client";
import { batchGpsEditsAreVerified, batchGpsWriteTags } from "../app/batch-processor";

const read = async (file: File) => {
  const result = await parseMetadata(file, { args: ["-json", "-G1", "-a", "-s"], transform: JSON.parse });
  assert.equal(result.success, true, result.success ? "" : result.error);
  return normalizeExifToolFields(result.data[0]);
};
const write = async (file: File, tags: Record<string, ExifTagValue>, stage = "edit") => {
  const iptc = Object.entries(tags).some(([key, value]) => key.startsWith("IPTC:") && value !== "");
  const result = await writeMetadata(file, iptc ? { ...tags, "IPTC:CodedCharacterSet": "UTF8" } : tags, {
    args: ["-m", "-charset", "UTF8", ...(iptc ? ["-charset", "IPTC=UTF8"] : []),
      ...(stage === "cleanup" && "All" in tags ? ["-q", "-q"] : [])],
  });
  assert.equal(result.success, true, result.success ? "" : result.error);
  return new File([result.data], file.name, { type: file.type });
};

for (const [extension, format] of [["jpg", "jpeg"], ["png", "png"], ["webp", "webp"]] as const) {
  test(`${extension}: GPS and camera edits survive cleanup, with original image data intact`, async () => {
    try {
      const source = new File([await readFile(new URL(`./fixtures/metadata-edit.${extension}`, import.meta.url))], `test.${extension}`);
      const seeded = await write(source, {
        ...semanticWriteTags("make", "Old camera"),
        ...semanticWriteTags("description", "Old caption"),
        ...semanticWriteTags("keywords", "old,keywords"),
        "EXIF:SerialNumber": "private-serial",
        "Photoshop:CopyrightFlag": true,
      });
      const edits = {
        ...semanticWriteTags("make", "SONY"),
        ...semanticWriteTags("model", "ILCE-7RM5"),
        ...semanticWriteTags("lensModel", "TAMRON 28-75mm F2.8"),
        ...semanticWriteTags("keywords", "旅行,风光"),
        FNumber: "1.25", ExposureTime: "0.15", ISO: "200", FocalLength: "35",
        ...batchGpsWriteTags({ latitude: 31.230416, longitude: 121.473701, altitude: -3.5, direction: 123.4567 }),
      };
      for (const deletion of [null, "Photoshop:All", "EXIF:All", "XMP:All", "All"]) {
        const targets = expandCleanupTargets(deletion ? [deletion] : [], format);
        let cleanupVerified = false;
        const output = await writeMetadataInStages({
          file: seeded, edits, deletions: Object.fromEntries(targets.map((tag) => [tag, ""])), write,
          verifyCleanup: async (cleaned) => {
            assert.deepEqual(remainingDeletionTargets(await read(cleaned), targets), []);
            cleanupVerified = true;
          },
        });
        assert.equal(cleanupVerified, deletion !== null);
        const fields = await read(output);
        for (const [key, expected] of [["make", "SONY"], ["model", "ILCE-7RM5"], ["lensModel", "TAMRON 28-75mm F2.8"], ["keywords", "旅行,风光"]] as const) {
          assert.ok(semanticValueMatches(fields, key, expected), `${deletion}: ${key}`);
        }
        const tags = ExifReader.load(await output.arrayBuffer());
        assert.equal(storedNumericValue(tags.FNumber!.value), "1.25");
        assert.equal(storedNumericValue(tags.ExposureTime!.value), "0.15");
        // These rounded descriptions are what the old export verifier compared.
        assert.equal(tags.FNumber!.description, "f/1.3");
        assert.equal(tags.ExposureTime!.description, "1/7");
        assert.ok(Math.abs(Number(tags.GPSLatitude!.description) - 31.230416) < 0.000001);
        assert.ok(Math.abs(Number(tags.GPSLongitude!.description) - 121.473701) < 0.000001);
        const raw = await parseMetadata(output, { args: ["-json", "-G1", "-a", "-s", "-n"], transform: JSON.parse });
        assert.ok(raw.success);
        assert.equal(batchGpsEditsAreVerified(normalizeExifToolFields(raw.data[0]), { latitude: 31.230416, longitude: 121.473701, altitude: -3.5, direction: 123.4567 }), true);
        assert.equal(await imageDataDigest(source, format as SupportedImageFormat), await imageDataDigest(output, format as SupportedImageFormat));
        if (deletion === "All") {
          assert.equal(semanticValueFromFields(fields, "description"), "");
          assert.equal(fields.some((field) => /SerialNumber/i.test(field.tag)), false);
        }
      }
      const cleared = await write(seeded, { ...semanticWriteTags("keywords", ""), ...semanticWriteTags("title", "新标题") });
      assert.equal(semanticValueFromFields(await read(cleared), "keywords"), "");
    } finally { await dispose(); }
  });
}

test("JPEG: combined Photoshop/XMP/IPTC/credentials cleanup preserves all explicitly rewritten fields", async () => {
  try {
    const source = new File([await readFile(new URL("./fixtures/metadata-edit.jpg", import.meta.url))], "combined.jpg");
    const seeded = await write(source, {
      ...semanticWriteTags("title", "Old title"),
      ...semanticWriteTags("keywords", "old"),
      "Photoshop:CopyrightFlag": true,
    });
    const expected = {
      model: "ILCE-7RM4", dateTime: "2026:06:23 13:22:00", title: "coffee",
      artist: "eomoment", copyright: "eomoment.com", keywords: "Café",
      city: "Chiang Mai", country: "Tailand", description: "Fahtara Café",
    } as const;
    const gps = { latitude: 18.793381, longitude: 98.999284 };
    const edits: Record<string, ExifTagValue> = { ...batchGpsWriteTags(gps) };
    for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
      Object.assign(edits, semanticWriteTags(key, expected[key]));
    }
    const targets = ["Photoshop:All", "XMP:All", "IPTC:All", "JUMBF:All"];
    const output = await writeMetadataInStages({
      file: seeded, edits, deletions: Object.fromEntries(targets.map(tag => [tag, ""])), write,
      verifyCleanup: async cleaned => {
        assert.deepEqual(remainingDeletionTargets(await read(cleaned), targets), []);
      },
    });
    const fields = await read(output);
    for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
      assert.ok(semanticValueMatches(fields, key, expected[key]), key);
    }
    const raw = await parseMetadata(output, { args: ["-json", "-G1", "-a", "-s", "-n"], transform: JSON.parse });
    assert.ok(raw.success);
    assert.ok(batchGpsEditsAreVerified(normalizeExifToolFields(raw.data[0]), gps));
    assert.deepEqual(remainingDeletionTargets(fields, ["Photoshop:All", "JUMBF:All"]), []);
    assert.equal(await imageDataDigest(source, "jpeg"), await imageDataDigest(output, "jpeg"));
  } finally { await dispose(); }
});

test("cleanup verification failure blocks the edit pass", async () => {
  const stages: string[] = [];
  await assert.rejects(writeMetadataInStages({
    file: new File([], "test.jpg"), edits: { Make: "SONY" }, deletions: { "EXIF:All": "" },
    write: async (file, _tags, stage) => { stages.push(stage); return file; },
    verifyCleanup: async () => { throw new Error("cleanup verification failed"); },
  }), /cleanup verification failed/);
  assert.deepEqual(stages, ["cleanup"]);
});

test("cleanup-only requests return the verified clean copy without an edit pass", async () => {
  const stages: string[] = [];
  const cleaned = new File(["cleaned"], "test.jpg");
  const output = await writeMetadataInStages({
    file: new File([], "test.jpg"), edits: {}, deletions: { "Photoshop:All": "" },
    write: async (_file, _tags, stage) => { stages.push(stage); return cleaned; },
    verifyCleanup: async (file) => { assert.equal(file, cleaned); },
  });
  assert.equal(output, cleaned);
  assert.deepEqual(stages, ["cleanup"]);
});
