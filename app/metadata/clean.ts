import type { MetadataField } from "./schema";

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
  field.key.toLowerCase() === tag.toLowerCase() || field.tag.toLowerCase() === tag.toLowerCase();

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
    if (groups && fields.some((field) => groups.includes(field.group))) remaining.push(tag);
    if (!groups && fields.some((field) => matchesIndividualDeletion(field, tag))) remaining.push(tag);
  }
  return remaining;
};

export const deletedMetadataIsAbsent = (
  fields: MetadataField[],
  deletionTags: Iterable<string>,
): boolean => remainingDeletionTargets(fields, deletionTags).length === 0;
