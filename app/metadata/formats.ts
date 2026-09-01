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
    if (["VP8 ", "VP8L", "VP8X"].includes(type)) parts.push(bytes.subarray(offset, end));
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
