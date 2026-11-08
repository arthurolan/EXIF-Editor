export type CoordinateAxis = "latitude" | "longitude";

/** Accept decimal degrees, degrees/minutes, or DMS without guessing a hemisphere. */
export function parseCoordinateInput(input: string, axis: CoordinateAxis): number | null {
  let text = input.replace(/º/g, "°").normalize("NFKC").trim().toUpperCase()
    .replace(/\b(?:DEGREES?|DEG)\b/g, "°").replace(/\b(?:MINUTES?|MIN)\b/g, "′").replace(/\b(?:SECONDS?|SEC)\b/g, "\"")
    .replace(/[−–—]/g, "-")
    .replace(/北纬|北緯|北|NORTH/g, "N").replace(/南纬|南緯|南|SOUTH/g, "S")
    .replace(/东经|東經|东|東|EAST/g, "E").replace(/西经|西經|西|WEST/g, "W");
  if (!text) return null;
  const directions = text.match(/[NSEW]/g) ?? [];
  if (directions.length > 1) return null;
  const direction = directions[0];
  if (direction && !(axis === "latitude" ? ["N", "S"] : ["E", "W"]).includes(direction)) return null;
  // Direction belongs at one edge, never between the numeric components.
  if (direction && !new RegExp(`^(?:${direction}\\s*[^NSEW]+|[^NSEW]+\\s*${direction})$`).test(text)) return null;
  text = text.replace(/[NSEW]/g, "").trim();
  const negative = text.startsWith("-");
  const explicitPositive = text.startsWith("+");
  if (direction && ((negative && ["N", "E"].includes(direction)) || (explicitPositive && ["S", "W"].includes(direction)))) return null;
  // Normalize common DMS typography, including ASCII quotes and Chinese units.
  text = text.replace(/[′’']{2}|[″”"秒]/g, "s").replace(/[°度]/g, "d").replace(/[′’'分]/g, "m");
  const number = "(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
  const match = text.match(new RegExp(`^([+-]?${number})(?:\\s*d)?(?:[\\s:,]+(${number})(?:\\s*m)?(?:[\\s:,]+(${number})(?:\\s*s)?)?)?\\s*$`))
    // Unit markers can separate components without spaces: 31°13′49.5″.
    ?? text.match(new RegExp(`^([+-]?${number})\\s*d\\s*(${number})(?:\\s*m)(?:\\s*(${number})\\s*s?)?\\s*$`));
  if (!match) return null;
  const degrees = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  if (match[2] !== undefined && !Number.isInteger(degrees)) return null;
  if (match[3] !== undefined && !Number.isInteger(minutes)) return null;
  if (minutes >= 60 || seconds >= 60) return null;
  const magnitude = Math.abs(degrees) + minutes / 60 + seconds / 3600;
  if (!Number.isFinite(magnitude) || magnitude > (axis === "latitude" ? 90 : 180)) return null;
  const result = (negative || direction === "S" || direction === "W") ? -magnitude : magnitude;
  return Object.is(result, -0) ? 0 : result;
}

export const coordinatePreview = (value: number): string =>
  value.toFixed(8).replace(/\.?0+$/, "");
