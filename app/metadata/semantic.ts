import { MetadataField, firstMetadataValue } from "./schema";

export type SemanticFieldKey =
  | "artist"
  | "copyright"
  | "title"
  | "description"
  | "keywords"
  | "dateTime"
  | "make"
  | "model"
  | "lensModel"
  | "city"
  | "country";

export type SemanticFieldDefinition = {
  key: SemanticFieldKey;
  tags: string[];
  list?: boolean;
};

export type SemanticConflict = {
  key: SemanticFieldKey;
  label: string;
  values: Array<{
    tag: string;
    value: string;
  }>;
};

export const SEMANTIC_FIELDS: SemanticFieldDefinition[] = [
  {
    key: "artist",
    tags: ["EXIF:Artist", "XMP-dc:Creator", "IPTC:By-line"],
  },
  {
    key: "copyright",
    tags: ["EXIF:Copyright", "XMP-dc:Rights", "IPTC:CopyrightNotice"],
  },
  {
    key: "title",
    tags: ["XMP-dc:Title", "IPTC:ObjectName"],
  },
  {
    key: "description",
    tags: ["EXIF:ImageDescription", "XMP-dc:Description", "IPTC:Caption-Abstract"],
  },
  {
    key: "keywords",
    tags: ["XMP-dc:Subject", "IPTC:Keywords"],
    list: true,
  },
  {
    key: "dateTime",
    tags: ["EXIF:DateTimeOriginal", "XMP-exif:DateTimeOriginal"],
  },
  {
    key: "make",
    tags: ["EXIF:Make", "XMP-tiff:Make"],
  },
  {
    key: "model",
    tags: ["EXIF:Model", "XMP-tiff:Model"],
  },
  {
    key: "lensModel",
    tags: ["EXIF:LensModel", "XMP-exifEX:LensModel"],
  },
  {
    key: "city",
    tags: ["XMP-photoshop:City", "IPTC:City"],
  },
  {
    key: "country",
    tags: ["XMP-photoshop:Country", "IPTC:Country-PrimaryLocationName"],
  },
];

const uniqueValues = (values: string[]): string[] =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))];

export const semanticValueFromFields = (
  fields: MetadataField[],
  key: SemanticFieldKey,
): string => {
  const definition = SEMANTIC_FIELDS.find((field) => field.key === key);
  return definition ? firstMetadataValue(fields, definition.tags) : "";
};

export const semanticWriteTags = (
  key: SemanticFieldKey,
  value: string,
): Record<string, string | string[]> => {
  const definition = SEMANTIC_FIELDS.find((field) => field.key === key);
  if (!definition) return {};
  const nextValue = definition.list
    ? value
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean)
    : value;
  return Object.fromEntries(definition.tags.map((tag) => [tag, nextValue]));
};

export const semanticConflicts = (
  fields: MetadataField[],
  labels: Record<SemanticFieldKey, string>,
): SemanticConflict[] =>
  SEMANTIC_FIELDS.map((definition) => {
    const values = definition.tags
      .map((tag) => ({
        tag,
        value: fields.find((field) => field.key === tag)?.value.trim() ?? "",
      }))
      .filter((item) => item.value);
    const distinct = uniqueValues(values.map((item) => item.value));
    if (distinct.length < 2) return null;
    return {
      key: definition.key,
      label: labels[definition.key],
      values,
    };
  }).filter((conflict): conflict is SemanticConflict => Boolean(conflict));
