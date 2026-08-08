export type MetadataGroup =
  | "EXIF"
  | "GPS"
  | "XMP"
  | "IPTC"
  | "MakerNotes"
  | "ICC"
  | "Photoshop"
  | "C2PA"
  | "File"
  | "Composite"
  | "Other";

export type MetadataField = {
  group: MetadataGroup;
  tag: string;
  key: string;
  label: string;
  value: string;
  writable: boolean;
  risk: "safe" | "caution" | "danger";
};

export type ExifToolJsonRecord = Record<string, unknown>;

const WRITABLE_SAFE_TAGS = new Set([
  "EXIF:Make",
  "EXIF:Model",
  "EXIF:LensModel",
  "EXIF:FNumber",
  "EXIF:ExposureTime",
  "EXIF:ISO",
  "EXIF:FocalLength",
  "EXIF:DateTimeOriginal",
  "EXIF:Artist",
  "EXIF:Copyright",
  "EXIF:ImageDescription",
  "XMP-dc:Title",
  "XMP-dc:Description",
  "XMP-dc:Creator",
  "XMP-dc:Rights",
  "XMP-dc:Subject",
  "XMP:Rating",
  "XMP-photoshop:City",
  "XMP-photoshop:Country",
  "XMP-photoshop:Source",
  "XMP-xmpRights:WebStatement",
  "IPTC:ObjectName",
  "IPTC:Caption-Abstract",
  "IPTC:By-line",
  "IPTC:CopyrightNotice",
  "IPTC:Keywords",
  "IPTC:City",
  "IPTC:Country-PrimaryLocationName",
  "GPS:GPSLatitude",
  "GPS:GPSLatitudeRef",
  "GPS:GPSLongitude",
  "GPS:GPSLongitudeRef",
  "GPS:GPSAltitude",
  "GPS:GPSImgDirection",
]);

const DESTRUCTIVE_PATTERNS = [/^MakerNotes:/, /^ICC_Profile:/, /^Photoshop:/, /^JUMBF:/, /^C2PA:/];

export const CLEANUP_PRESETS = {
  none: {
    tags: [],
  },
  privacy: {
    tags: [
      "GPS:All",
      "SerialNumber",
      "InternalSerialNumber",
      "CameraSerialNumber",
      "LensSerialNumber",
      "BodySerialNumber",
      "Software",
      "ProcessingSoftware",
      "ThumbnailImage",
      "PreviewImage",
    ],
  },
  social: {
    tags: [
      "GPS:All",
      "MakerNotes:All",
      "SerialNumber",
      "InternalSerialNumber",
      "CameraSerialNumber",
      "LensSerialNumber",
      "BodySerialNumber",
      "ThumbnailImage",
      "PreviewImage",
    ],
  },
  appearance: {
    tags: ["EXIF:All", "GPS:All", "XMP:All", "IPTC:All", "MakerNotes:All", "Photoshop:All"],
  },
  full: {
    tags: ["All", "ICC_Profile:All", "JUMBF:All"],
  },
} as const;

export type CleanupPreset = keyof typeof CLEANUP_PRESETS;

export const ADVANCED_DELETE_TAGS = [
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
] as const;

export type AdvancedDeleteTag = (typeof ADVANCED_DELETE_TAGS)[number];

export const metadataGroupFromKey = (key: string): MetadataGroup => {
  const group = key.split(":")[0] ?? "";
  if (group === "GPS") return "GPS";
  if (group === "IPTC" || group === "IPTC2") return "IPTC";
  if (group.startsWith("XMP")) return "XMP";
  if (group === "MakerNotes" || group.endsWith("MakerNotes")) return "MakerNotes";
  if (group === "ICC_Profile") return "ICC";
  if (group === "Photoshop") return "Photoshop";
  if (group === "JUMBF" || group === "C2PA") return "C2PA";
  if (group === "File") return "File";
  if (group === "Composite") return "Composite";
  if (["EXIF", "IFD0", "ExifIFD", "InteropIFD", "IFD1"].includes(group)) return "EXIF";
  return "Other";
};

export const metadataValueToString = (value: unknown): string => {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(metadataValueToString).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

export const normalizeExifToolFields = (record: ExifToolJsonRecord): MetadataField[] =>
  Object.entries(record)
    .filter(([key]) => key !== "SourceFile")
    .map(([key, value]) => {
      const group = metadataGroupFromKey(key);
      const tag = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
      const destructive = DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(key));
      const writable = WRITABLE_SAFE_TAGS.has(key);
      const risk: MetadataField["risk"] = destructive
        ? "danger"
        : writable
          ? "safe"
          : group === "MakerNotes"
            ? "danger"
            : "caution";
      return {
        group,
        tag,
        key,
        label: tag.replace(/([a-z])([A-Z])/g, "$1 $2"),
        value: metadataValueToString(value),
        writable,
        risk,
      };
    })
    .sort((left, right) => {
      const groupOrder = left.group.localeCompare(right.group);
      return groupOrder || left.tag.localeCompare(right.tag);
    });

export const firstMetadataValue = (fields: MetadataField[], keys: string[]): string => {
  for (const key of keys) {
    const value = fields.find((field) => field.key === key)?.value;
    if (value) return value;
  }
  return "";
};
