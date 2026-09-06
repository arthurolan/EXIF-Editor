import { outputNameFor } from "./export-delivery.mjs";
import { gpsDeletionTags, isGpsLocationMetadataField, privacySerialDeletionTagsForPreset, remainingDeletionTargets, remainingPrivacySerialFields } from "./metadata/clean";
import { fileForMetadataWrite, formatSafetyFromBuffer, imageDataDigest, imageFormatFromFile } from "./metadata/formats";
import { CLEANUP_PRESETS, normalizeExifToolFields, type MetadataField } from "./metadata/schema";

export type BatchOperation = "privacy" | "removeGps";
export type BatchPhase = "reading" | "writing" | "verifying";

export type BatchProcessResult =
  | { success: true; file: File }
  | { success: false; reason: string };

const tiffImageFields = new Set([
  "NewSubfileType", "SubfileType", "ImageWidth", "ImageHeight", "BitsPerSample", "Compression",
  "PhotometricInterpretation", "StripOffsets", "SamplesPerPixel", "RowsPerStrip", "StripByteCounts",
  "PlanarConfiguration", "TileWidth", "TileLength", "TileOffsets", "TileByteCounts", "SampleFormat",
  "Predictor", "ExtraSamples", "Orientation", "XResolution", "YResolution", "XPosition", "YPosition",
  "ResolutionUnit", "SubIFD", "ExifOffset", "GPSInfo", "YCbCrCoefficients", "YCbCrSubSampling",
  "YCbCrPositioning", "ReferenceBlackWhite", "ColorMap", "SMinSampleValue", "SMaxSampleValue",
  "TransferFunction", "WhitePoint", "PrimaryChromaticities",
]);

const isRequiredTiffImageField = (key: string): boolean => {
  const separator = key.indexOf(":");
  return separator >= 0 && ["EXIF", "IFD0", "IFD1", "ExifIFD"].includes(key.slice(0, separator)) && tiffImageFields.has(key.slice(separator + 1));
};

const isRequiredHeicVisualMetadata = (key: string): boolean =>
  /^ICC_Profile\d*:/i.test(key) ||
  /^XMP-(?:x:|semanticSegmentationMatte:|apdi:|depthData:|depthBlurEffect:|portraitLightingEffect:|HDRGainMap:)/.test(key);

const verificationFields = (fields: MetadataField[], format: string): MetadataField[] =>
  format === "tiff"
    ? fields.filter((field) => !isRequiredTiffImageField(field.key))
    : format === "heic"
      ? fields.filter((field) => !isRequiredHeicVisualMetadata(field.key))
      : fields;

export const batchDeletionTags = (fields: MetadataField[], operation: BatchOperation): string[] => {
  const gpsTargets = gpsDeletionTags(fields);
  const cleanupTargets = operation === "privacy" ? [...CLEANUP_PRESETS.privacy.tags] : [];
  const serialTargets = operation === "privacy" ? privacySerialDeletionTagsForPreset(fields, "privacy") : [];
  return [...new Set([...gpsTargets, ...cleanupTargets, ...serialTargets])];
};

/** Processes one file only. The caller owns queueing so no two WASM writes overlap. */
export const processBatchFile = async (
  file: File,
  operation: BatchOperation,
  onPhase: (phase: BatchPhase) => void,
): Promise<BatchProcessResult> => {
  const format = imageFormatFromFile(file);
  if (!format) return { success: false, reason: "Unsupported image format." };

  try {
    const safety = formatSafetyFromBuffer(await file.arrayBuffer(), format.format);
    if (!safety.writable) return { success: false, reason: safety.reason };

    onPhase("reading");
    const { readMetadataInWorker, writeMetadataInWorker } = await import("./exif-write-client");
    const inputMetadata = await readMetadataInWorker(file);
    if (!inputMetadata.success) return { success: false, reason: inputMetadata.error || "Metadata could not be read." };
    const fields = normalizeExifToolFields(inputMetadata.data);
    const deletionTargets = batchDeletionTags(fields, operation);
    const tags: Record<string, string> = Object.fromEntries(deletionTargets.map((tag) => [tag, ""]));

    onPhase("writing");
    const result = await writeMetadataInWorker(
      await fileForMetadataWrite(file, format.format),
      tags,
      ["-charset", "UTF8"],
      (phase) => onPhase(phase === "loading" ? "reading" : "writing"),
    );
    if (!result.success) return { success: false, reason: result.error || "Metadata write failed." };
    if (!result.data) return { success: false, reason: "Metadata write produced no output." };

    const output = new File([result.data], outputNameFor(file.name, format.extension), { type: format.mimeType });
    onPhase("verifying");
    const verified = await readMetadataInWorker(output);
    if (!verified.success) return { success: false, reason: "The exported file could not be verified." };
    const outputFields = verificationFields(normalizeExifToolFields(verified.data), format.format);
    if (outputFields.some(isGpsLocationMetadataField)) return { success: false, reason: "GPS verification failed; this copy was not delivered." };
    if (remainingDeletionTargets(outputFields, deletionTargets).length) {
      return { success: false, reason: "Privacy-cleanup verification failed; this copy was not delivered." };
    }
    if (operation === "privacy" && remainingPrivacySerialFields(outputFields).length) {
      return { success: false, reason: "Serial-number privacy verification failed; this copy was not delivered." };
    }
    const sameImageData = format.format === "heic"
      ? formatSafetyFromBuffer(result.data, format.format).writable
      : await imageDataDigest(file, format.format) === await imageDataDigest(output, format.format);
    if (!sameImageData) return { success: false, reason: "Image-data verification failed; this copy was not delivered." };
    return { success: true, file: output };
  } catch (cause) {
    return { success: false, reason: cause instanceof Error ? cause.message : "Unexpected processing error." };
  }
};
