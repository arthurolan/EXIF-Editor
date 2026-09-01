export type SupportedImageFormat = "jpeg" | "png" | "webp";

export type ImageFormatInfo = {
  format: SupportedImageFormat;
  extension: "jpg" | "png" | "webp";
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  label: "JPEG" | "PNG" | "WebP";
};

const FORMAT_INFO: Record<SupportedImageFormat, ImageFormatInfo> = {
  jpeg: { format: "jpeg", extension: "jpg", mimeType: "image/jpeg", label: "JPEG" },
  png: { format: "png", extension: "png", mimeType: "image/png", label: "PNG" },
  webp: { format: "webp", extension: "webp", mimeType: "image/webp", label: "WebP" },
};

export const imageFormatFromFile = (
  file: Pick<File, "name" | "type">,
): ImageFormatInfo | null => {
  if (file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name)) return FORMAT_INFO.jpeg;
  if (file.type === "image/png" || /\.png$/i.test(file.name)) return FORMAT_INFO.png;
  if (file.type === "image/webp" || /\.webp$/i.test(file.name)) return FORMAT_INFO.webp;
  return null;
};

const concatBytes = (parts: Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

const standaloneArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.slice().buffer as ArrayBuffer;

const readBigEndianUint32 = (bytes: Uint8Array, offset: number): number =>
  new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);

const writeBigEndianUint32 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
};

const crc32 = (bytes: Uint8Array): number => {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
};

const utf8TextInLegacyPngChunk = (data: Uint8Array): { keyword: Uint8Array; text: Uint8Array } | null => {
  const separator = data.indexOf(0);
  if (separator < 1) return null;
  const keyword = data.subarray(0, separator);
  const text = data.subarray(separator + 1);
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(text);
    return /[^\x00-\x7f]/.test(decoded) ? { keyword, text } : null;
  } catch {
    return null;
  }
};

/**
 * A few PNG generators put UTF-8 into legacy Latin-1 tEXt chunks. ExifTool's
 * browser WASM runtime cannot decode that malformed combination. Re-encode
 * only those chunks as standards-compliant UTF-8 iTXt; IDAT bytes are copied
 * byte-for-byte, so the image itself is unchanged.
 */
export const normalizePngUtf8TextChunks = (buffer: ArrayBuffer): Uint8Array | null => {
  const source = new Uint8Array(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((byte, index) => source[index] === byte)) return null;

  const parts: Uint8Array[] = [source.subarray(0, 8)];
  let offset = 8;
  let changed = false;
  while (offset + 12 <= source.length) {
    const length = readBigEndianUint32(source, offset);
    const end = offset + 12 + length;
    if (end > source.length) return null;
    const type = String.fromCharCode(...source.subarray(offset + 4, offset + 8));
    const data = source.subarray(offset + 8, offset + 8 + length);
    const legacyText = type === "tEXt" ? utf8TextInLegacyPngChunk(data) : null;
    if (!legacyText) {
      parts.push(source.subarray(offset, end));
    } else {
      const iTxtData = concatBytes([
        legacyText.keyword,
        new Uint8Array([0, 0, 0, 0, 0]),
        legacyText.text,
      ]);
      const typeBytes = new TextEncoder().encode("iTXt");
      const checksum = writeBigEndianUint32(crc32(concatBytes([typeBytes, iTxtData])));
      parts.push(writeBigEndianUint32(iTxtData.length), typeBytes, iTxtData, checksum);
      changed = true;
    }
    offset = end;
    if (type === "IEND") return changed ? concatBytes(parts) : null;
  }
  return null;
};

export const fileForMetadataWrite = async (
  file: File,
  format: SupportedImageFormat,
): Promise<File> => {
  if (format !== "png") return file;
  const normalized = normalizePngUtf8TextChunks(await file.arrayBuffer());
  return normalized ? new File([standaloneArrayBuffer(normalized)], file.name, { type: file.type }) : file;
};

const jpegImageData = (bytes: Uint8Array): Uint8Array => {
  for (let index = 2; index < bytes.length - 4; ) {
    if (bytes[index] !== 0xff) {
      index += 1;
      continue;
    }
    const marker = bytes[index + 1];
    if (marker === 0xda) return bytes.subarray(index);
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      index += 2;
      continue;
    }
    const length = (bytes[index + 2] << 8) | bytes[index + 3];
    if (length < 2) break;
    index += 2 + length;
  }
  return bytes;
};

const pngImageData = (bytes: Uint8Array): Uint8Array => {
  const parts: Uint8Array[] = [];
  for (let offset = 8; offset + 12 <= bytes.length; ) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const end = offset + 12 + length;
    if (end > bytes.length) return bytes;
    if (type === "IDAT") parts.push(bytes.subarray(offset + 4, end - 4));
    offset = end;
  }
  return parts.length ? concatBytes(parts) : bytes;
};

const webpImageData = (bytes: Uint8Array): Uint8Array => {
  const parts: Uint8Array[] = [];
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const type = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true);
    const end = offset + 8 + length;
    if (end > bytes.length) return bytes;
    // VP8X only describes the canvas and metadata-presence flags. ExifTool may
    // change those flags when metadata is written, without changing pixels.
    if (["VP8 ", "VP8L"].includes(type)) parts.push(bytes.subarray(offset, end));
    offset = end + (length % 2);
  }
  return parts.length ? concatBytes(parts) : bytes;
};

export const imageDataPayload = (buffer: ArrayBuffer, format: SupportedImageFormat): Uint8Array => {
  const bytes = new Uint8Array(buffer);
  if (format === "jpeg") return jpegImageData(bytes);
  if (format === "png") return pngImageData(bytes);
  return webpImageData(bytes);
};

export const imageDataDigest = async (file: Blob, format: SupportedImageFormat): Promise<string> => {
  const payload = imageDataPayload(await file.arrayBuffer(), format);
  const digest = await crypto.subtle.digest("SHA-256", payload as unknown as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};
