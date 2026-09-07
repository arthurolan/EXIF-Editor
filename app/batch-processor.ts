import { outputNameFor } from "./export-delivery.mjs";
import { gpsDeletionTags, isGpsLocationMetadataField, privacySerialDeletionTagsForPreset, remainingDeletionTargets, remainingPrivacySerialFields } from "./metadata/clean";
import { fileForMetadataWrite, formatSafetyFromBuffer, imageDataDigest, imageFormatFromFile, type SupportedImageFormat } from "./metadata/formats";
import { CLEANUP_PRESETS, normalizeExifToolFields, type MetadataField } from "./metadata/schema";
import { semanticValueFromFields, semanticWriteTags, type SemanticFieldKey } from "./metadata/semantic";

export type BatchOperation = "privacy" | "removeGps" | "metadata" | "shiftTime" | "writeGps";
export type BatchPhase = "reading" | "writing" | "verifying";
export type BatchTextField = Extract<SemanticFieldKey, "artist" | "copyright" | "keywords" | "city" | "country">;
export type BatchTextEdits = Partial<Record<BatchTextField, string>>;
export type BatchTimeOffset = { days: number; hours: number; minutes: number };
export type BatchGpsInput = { latitude: string; longitude: string; altitude: string; direction: string };
export type BatchGpsEdits = { latitude: number; longitude: number; altitude?: number; direction?: number };

export type BatchProcessResult =
  | { success: true; file: File; skippedTextFields?: BatchTextField[] }
  | { success: false; reason: string };

const HEIC_UNSUPPORTED_BATCH_TEXT_FIELDS: BatchTextField[] = ["keywords", "city", "country"];

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
  if (operation === "metadata" || operation === "shiftTime" || operation === "writeGps") return [];
  const gpsTargets = gpsDeletionTags(fields);
  const cleanupTargets = operation === "privacy" ? [...CLEANUP_PRESETS.privacy.tags] : [];
  const serialTargets = operation === "privacy" ? privacySerialDeletionTagsForPreset(fields, "privacy") : [];
  return [...new Set([...gpsTargets, ...cleanupTargets, ...serialTargets])];
};

export const hasBatchTextEdits = (edits: BatchTextEdits): boolean =>
  Object.values(edits).some((value) => Boolean(value?.trim()));

export const unavailableBatchTextFields = (
  format: SupportedImageFormat,
  edits: BatchTextEdits,
): BatchTextField[] =>
  format === "heic"
    ? HEIC_UNSUPPORTED_BATCH_TEXT_FIELDS.filter((field) => Boolean(edits[field]?.trim()))
    : [];

export const batchTextEditsForFormat = (
  format: SupportedImageFormat,
  edits: BatchTextEdits,
): BatchTextEdits => {
  if (format !== "heic") return { ...edits };
  const compatible = { ...edits };
  for (const field of HEIC_UNSUPPORTED_BATCH_TEXT_FIELDS) delete compatible[field];
  return compatible;
};

export const batchTextWriteTags = (edits: BatchTextEdits): Record<string, string | string[]> => {
  const tags: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(edits) as Array<[BatchTextField, string | undefined]>) {
    if (value?.trim()) Object.assign(tags, semanticWriteTags(key, value.trim()));
  }
  return tags;
};

export const batchTextEditsAreVerified = (fields: MetadataField[], edits: BatchTextEdits): boolean =>
  (Object.entries(edits) as Array<[BatchTextField, string | undefined]>).every(
    ([key, value]) => !value?.trim() || semanticValueFromFields(fields, key) === value.trim(),
  );

const padDatePart = (value: number): string => String(value).padStart(2, "0");

/** Adds a calendar-time offset without converting the photo's local timestamp to UTC. */
export const offsetExifDateTime = (value: string, offset: BatchTimeOffset): string | null => {
  const match = value.trim().match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "0"] = match;
  const year = Number(yearText); const month = Number(monthText); const day = Number(dayText);
  const hour = Number(hourText); const minute = Number(minuteText); const second = Number(secondText);
  if (![year, month, day, hour, minute, second, offset.days, offset.hours, offset.minutes].every(Number.isFinite)) return null;
  const source = new Date(year, month - 1, day, hour, minute, second);
  if (source.getFullYear() !== year || source.getMonth() !== month - 1 || source.getDate() !== day || source.getHours() !== hour || source.getMinutes() !== minute || source.getSeconds() !== second) return null;
  const shifted = new Date(source.getTime() + (offset.days * 1440 + offset.hours * 60 + offset.minutes) * 60_000);
  if (Number.isNaN(shifted.getTime())) return null;
  return `${shifted.getFullYear()}:${padDatePart(shifted.getMonth() + 1)}:${padDatePart(shifted.getDate())} ${padDatePart(shifted.getHours())}:${padDatePart(shifted.getMinutes())}:${padDatePart(shifted.getSeconds())}`;
};

export const parseBatchGpsEdits = (input: BatchGpsInput): BatchGpsEdits | null => {
  const latitude = Number(input.latitude); const longitude = Number(input.longitude);
  const altitude = input.altitude.trim() ? Number(input.altitude) : undefined;
  const direction = input.direction.trim() ? Number(input.direction) : undefined;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if ((altitude !== undefined && !Number.isFinite(altitude)) || (direction !== undefined && (!Number.isFinite(direction) || direction < 0 || direction >= 360))) return null;
  return { latitude, longitude, ...(altitude === undefined ? {} : { altitude }), ...(direction === undefined ? {} : { direction }) };
};

export const batchGpsWriteTags = (gps: BatchGpsEdits): Record<string, string | number> => ({
  GPSLatitude: Math.abs(gps.latitude),
  GPSLatitudeRef: gps.latitude < 0 ? "S" : "N",
  GPSLongitude: Math.abs(gps.longitude),
  GPSLongitudeRef: gps.longitude < 0 ? "W" : "E",
  ...(gps.altitude === undefined ? {} : { GPSAltitude: Math.abs(gps.altitude), GPSAltitudeRef: gps.altitude < 0 ? 1 : 0 }),
  ...(gps.direction === undefined ? {} : { GPSImgDirection: gps.direction, GPSImgDirectionRef: "T" }),
});

const decimalGpsValue = (value: string): number | null => {
  const parts = value.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 1) return parts[0];
  return Math.abs(parts[0]) + parts[1] / 60 + (parts[2] ?? 0) / 3600;
};

const gpsFieldValue = (fields: MetadataField[], tag: string): string =>
  fields.find((field) => field.tag === tag && (field.group === "GPS" || field.group === "EXIF"))?.value ?? "";

export const batchGpsEditsAreVerified = (fields: MetadataField[], gps: BatchGpsEdits): boolean => {
  const latitude = decimalGpsValue(gpsFieldValue(fields, "GPSLatitude"));
  const longitude = decimalGpsValue(gpsFieldValue(fields, "GPSLongitude"));
  const latitudeRef = gpsFieldValue(fields, "GPSLatitudeRef");
  const longitudeRef = gpsFieldValue(fields, "GPSLongitudeRef");
  const signedLatitude = latitude === null ? null : /south|^s$/i.test(latitudeRef) ? -Math.abs(latitude) : Math.abs(latitude);
  const signedLongitude = longitude === null ? null : /west|^w$/i.test(longitudeRef) ? -Math.abs(longitude) : Math.abs(longitude);
  if (signedLatitude === null || signedLongitude === null || Math.abs(signedLatitude - gps.latitude) >= 0.000001 || Math.abs(signedLongitude - gps.longitude) >= 0.000001) return false;
  if (gps.altitude !== undefined) {
    const altitude = decimalGpsValue(gpsFieldValue(fields, "GPSAltitude"));
    const altitudeRef = gpsFieldValue(fields, "GPSAltitudeRef");
    const signedAltitude = altitude === null ? null : /(?:^|\D)1(?:\D|$)|below/i.test(altitudeRef) ? -Math.abs(altitude) : Math.abs(altitude);
    if (signedAltitude === null || Math.abs(signedAltitude - gps.altitude) >= 0.001) return false;
  }
  if (gps.direction !== undefined) {
    const direction = decimalGpsValue(gpsFieldValue(fields, "GPSImgDirection"));
    if (direction === null || Math.abs(direction - gps.direction) >= 0.001) return false;
  }
  return true;
};

/** Processes one file only. The caller owns queueing so no two WASM writes overlap. */
export const processBatchFile = async (
  file: File,
  operation: BatchOperation,
  textEdits: BatchTextEdits,
  timeOffset: BatchTimeOffset,
  gpsEdits: BatchGpsEdits | null,
  onPhase: (phase: BatchPhase) => void,
): Promise<BatchProcessResult> => {
  const format = imageFormatFromFile(file);
  if (!format) return { success: false, reason: "Unsupported image format." };
  const skippedTextFields = operation === "metadata" ? unavailableBatchTextFields(format.format, textEdits) : [];
  const effectiveTextEdits = operation === "metadata" ? batchTextEditsForFormat(format.format, textEdits) : textEdits;

  try {
    const safety = formatSafetyFromBuffer(await file.arrayBuffer(), format.format);
    if (!safety.writable) return { success: false, reason: safety.reason };

    onPhase("reading");
    const { readMetadataInWorker, writeMetadataInWorker } = await import("./exif-write-client");
    const inputMetadata = await readMetadataInWorker(file);
    if (!inputMetadata.success) return { success: false, reason: inputMetadata.error || "Metadata could not be read." };
    const fields = normalizeExifToolFields(inputMetadata.data);
    if (operation === "writeGps" && !gpsEdits) {
      return { success: false, reason: "GPS coordinates are invalid; this copy was not delivered." };
    }
    const shiftedDateTime = operation === "shiftTime"
      ? offsetExifDateTime(semanticValueFromFields(fields, "dateTime"), timeOffset)
      : null;
    if (operation === "shiftTime" && !shiftedDateTime) {
      return { success: false, reason: "The original capture time could not be read or shifted; this copy was not delivered." };
    }
    const deletionTargets = batchDeletionTags(fields, operation);
    const tags: Record<string, string | number | string[]> = {
      ...Object.fromEntries(deletionTargets.map((tag) => [tag, ""])),
      ...(operation === "metadata" ? batchTextWriteTags(effectiveTextEdits) : {}),
      ...(shiftedDateTime ? semanticWriteTags("dateTime", shiftedDateTime) : {}),
      ...(operation === "writeGps" && gpsEdits ? batchGpsWriteTags(gpsEdits) : {}),
    };
    if (operation === "metadata" && !hasBatchTextEdits(effectiveTextEdits)) {
      return { success: false, reason: "None of the requested text fields can be written to this format; this copy was not delivered." };
    }
    const hasIptcWrite = Object.keys(tags).some((tag) => tag.startsWith("IPTC:") && tags[tag] !== "");
    if (hasIptcWrite) tags["IPTC:CodedCharacterSet"] = "UTF8";

    onPhase("writing");
    const result = await writeMetadataInWorker(
      await fileForMetadataWrite(file, format.format),
      tags,
      hasIptcWrite ? ["-charset", "UTF8", "-charset", "IPTC=UTF8"] : ["-charset", "UTF8"],
      (phase) => onPhase(phase === "loading" ? "reading" : "writing"),
    );
    if (!result.success) return { success: false, reason: result.error || "Metadata write failed." };
    if (!result.data) return { success: false, reason: "Metadata write produced no output." };

    const output = new File([result.data], outputNameFor(file.name, format.extension), { type: format.mimeType });
    onPhase("verifying");
    const verified = await readMetadataInWorker(output);
    if (!verified.success) return { success: false, reason: "The exported file could not be verified." };
    const outputFields = verificationFields(normalizeExifToolFields(verified.data), format.format);
    const removesGps = operation === "privacy" || operation === "removeGps";
    if (removesGps && outputFields.some(isGpsLocationMetadataField)) return { success: false, reason: "GPS verification failed; this copy was not delivered." };
    if (remainingDeletionTargets(outputFields, deletionTargets).length) {
      return { success: false, reason: "Privacy-cleanup verification failed; this copy was not delivered." };
    }
    if (operation === "privacy" && remainingPrivacySerialFields(outputFields).length) {
      return { success: false, reason: "Serial-number privacy verification failed; this copy was not delivered." };
    }
    if (operation === "metadata" && !batchTextEditsAreVerified(outputFields, effectiveTextEdits)) {
      return { success: false, reason: "Text metadata verification failed; this copy was not delivered." };
    }
    if (shiftedDateTime && offsetExifDateTime(semanticValueFromFields(outputFields, "dateTime"), { days: 0, hours: 0, minutes: 0 }) !== shiftedDateTime) {
      return { success: false, reason: "Time-offset verification failed; this copy was not delivered." };
    }
    if (operation === "writeGps" && gpsEdits && !batchGpsEditsAreVerified(outputFields, gpsEdits)) {
      return { success: false, reason: "GPS write verification failed; this copy was not delivered." };
    }
    const sameImageData = format.format === "heic"
      ? formatSafetyFromBuffer(result.data, format.format).writable
      : await imageDataDigest(file, format.format) === await imageDataDigest(output, format.format);
    if (!sameImageData) return { success: false, reason: "Image-data verification failed; this copy was not delivered." };
    return { success: true, file: output, ...(skippedTextFields.length ? { skippedTextFields } : {}) };
  } catch (cause) {
    return { success: false, reason: cause instanceof Error ? cause.message : "Unexpected processing error." };
  }
};
