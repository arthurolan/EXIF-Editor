import type { ExifTagValue } from "../exif-write-client";

type Tags = Record<string, ExifTagValue>;

/** Validate the cleaned intermediate copy before any explicit edits recreate groups. */
export async function writeMetadataInStages({
  file,
  edits,
  deletions,
  write,
  verifyCleanup,
}: {
  file: File;
  edits: Tags;
  deletions: Tags;
  write: (file: File, tags: Tags, stage: "cleanup" | "edit") => Promise<File>;
  verifyCleanup: (file: File) => Promise<void>;
}): Promise<File> {
  let current = file;
  if (Object.keys(deletions).length) {
    current = await write(current, deletions, "cleanup");
    await verifyCleanup(current);
  }
  if (Object.keys(edits).length) {
    current = await write(current, edits, "edit");
  }
  return current;
}
