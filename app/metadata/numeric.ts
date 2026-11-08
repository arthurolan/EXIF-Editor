import type { MetadataField } from "./schema";

/** Read stored numbers, not display descriptions rounded by ExifReader. */
export function storedNumericValue(value: unknown, fraction = false): string | null {
  if (Array.isArray(value)) {
    if (value.length === 1) return storedNumericValue(value[0], fraction);
    if (value.length !== 2 || !value.every((part) => typeof part === "number" && Number.isFinite(part)) || value[1] === 0) return null;
    return fraction ? `${value[0]}/${value[1]}` : String(value[0] / value[1]);
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const ratio = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (ratio) return storedNumericValue([Number(ratio[1]), Number(ratio[2])], fraction);
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : null;
}


/** Compare every stored EXIF/XMP copy; ignore unrelated PNG text and derived tags. */
export function numericFieldMatches(fields: MetadataField[], tag: string, expected: string): boolean {
  const values = fields.filter((field) => ["EXIF", "XMP"].includes(field.group) && field.tag === tag).map((field) => field.value);
  if (!expected.trim()) return !values.some((value) => value.trim());
  const target = storedNumericValue(expected);
  if (target === null || !values.length) return false;
  return values.every((value) => {
    const actual = storedNumericValue(value);
    return actual !== null && Math.abs(Number(actual) - Number(target)) <= Math.max(1e-9, Math.abs(Number(target)) * 1e-6);
  });
}
