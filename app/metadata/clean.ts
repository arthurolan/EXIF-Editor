import type { MetadataField } from "./schema";

/**
 * GPS can be stored in the EXIF GPS IFD, or mirrored into XMP. Composite GPS
 * fields are deliberately excluded because ExifTool derives them from source
 * metadata rather than storing them in the file.
 */
export const isGpsMetadataField = (field: MetadataField): boolean =>
  field.group === "GPS" ||
  ((field.group === "EXIF" || field.group === "XMP") && /^GPS/i.test(field.tag));

/**
 * GPSVersionID is a format marker, not a location. Some PNG and WebP writers
 * retain this empty structural tag after deleting the GPS IFD. It must not
 * make a successful location removal look like a privacy failure.
 */
export const isGpsLocationMetadataField = (field: MetadataField): boolean =>
  isGpsMetadataField(field) && field.tag.toLowerCase() !== "gpsversionid";

const WRITABLE_PRIVACY_SERIAL_KEYS = new Set([
  "EXIF:SerialNumber",
  "EXIF:CameraSerialNumber",
  "EXIF:InternalSerialNumber",
  "EXIF:BodySerialNumber",
  "EXIF:LensSerialNumber",
  "XMP-exifEX:LensSerialNumber",
  "XMP-aux:LensSerialNumber",
]);

/**
 * Some XMP serial fields are read-only aliases in ExifTool. Delete the XMP
 * packet as a group in that case instead of issuing an individual, failing
 * write. Camera EXIF and recognised lens fields remain narrow deletions.
 */
export const privacySerialDeletionTags = (fields: MetadataField[]): string[] => {
  const tags = new Set<string>();
  for (const field of fields) {
    if (!/serial.?number/i.test(field.tag)) continue;
    if (WRITABLE_PRIVACY_SERIAL_KEYS.has(field.key)) tags.add(field.key);
    else if (field.group === "XMP") tags.add("XMP:All");
    else if (field.group === "MakerNotes") tags.add("MakerNotes:All");
  }
  return [...tags];
};

const DELETION_GROUPS: Record<string, MetadataField["group"][]> = {
  "EXIF:All": ["EXIF"],
  "GPS:All": ["GPS"],
  "XMP:All": ["XMP"],
  "IPTC:All": ["IPTC"],
  "MakerNotes:All": ["MakerNotes"],
  "ICC_Profile:All": ["ICC"],
  "Photoshop:All": ["Photoshop"],
  "JUMBF:All": ["C2PA"],
  All: ["EXIF", "GPS", "XMP", "IPTC", "MakerNotes", "ICC", "Photoshop", "C2PA"],
};

const matchesIndividualDeletion = (field: MetadataField, tag: string): boolean =>
  tag.includes(":")
    ? field.key.toLowerCase() === tag.toLowerCase()
    : field.tag.toLowerCase() === tag.toLowerCase();

/**
 * Checks only metadata the current operation asked ExifTool to delete. File and
 * Composite groups are intentionally ignored: they describe the output file,
 * not embedded metadata which can be removed.
 */
export const remainingDeletionTargets = (
  fields: MetadataField[],
  deletionTags: Iterable<string>,
): string[] => {
  const remaining: string[] = [];
  for (const tag of deletionTags) {
    const groups = DELETION_GROUPS[tag];
    if (tag === "GPS:All") {
      if (fields.some(isGpsLocationMetadataField)) remaining.push(tag);
      continue;
    }
    if (groups && fields.some((field) => groups.includes(field.group))) remaining.push(tag);
    if (!groups && fields.some((field) => matchesIndividualDeletion(field, tag))) remaining.push(tag);
  }
  return remaining;
};

export const deletedMetadataIsAbsent = (
  fields: MetadataField[],
  deletionTags: Iterable<string>,
): boolean => remainingDeletionTargets(fields, deletionTags).length === 0;
