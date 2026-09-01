import type { MetadataField } from "./schema";

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

const matchesTag = (field: MetadataField, key: string): boolean => {
  if (field.key === key) return true;

  const separator = key.indexOf(":");
  if (separator < 0) return false;
  const group = key.slice(0, separator);
  const tag = key.slice(separator + 1);
  return field.group === (group.startsWith("XMP") ? "XMP" : group) && field.tag === tag;
};

const valueForTag = (fields: MetadataField[], key: string): string =>
  fields.find((field) => matchesTag(field, key))?.value.trim() ?? "";

export const semanticValueFromFields = (
  fields: MetadataField[],
  key: SemanticFieldKey,
): string => {
  const definition = SEMANTIC_FIELDS.find((field) => field.key === key);
  if (!definition) return "";
  return definition.tags.map((tag) => valueForTag(fields, tag)).find(Boolean) ?? "";
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
        value: valueForTag(fields, tag),
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
