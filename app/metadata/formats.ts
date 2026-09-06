export type SupportedImageFormat = "jpeg" | "png" | "webp" | "tiff" | "heic";

export type ImageFormatInfo = {
  format: SupportedImageFormat;
  extension: "jpg" | "png" | "webp" | "tif" | "heic";
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/tiff" | "image/heic";
  label: "JPEG" | "PNG" | "WebP" | "TIFF" | "HEIC / HEIF";
  experimental?: boolean;
  verification: "encoded" | "structural";
};

export type FormatSafety = { writable: true } | { writable: false; reason: string };

const FORMAT_INFO: Record<SupportedImageFormat, ImageFormatInfo> = {
  jpeg: { format: "jpeg", extension: "jpg", mimeType: "image/jpeg", label: "JPEG", verification: "encoded" },
  png: { format: "png", extension: "png", mimeType: "image/png", label: "PNG", verification: "encoded" },
  webp: { format: "webp", extension: "webp", mimeType: "image/webp", label: "WebP", verification: "encoded" },
  tiff: { format: "tiff", extension: "tif", mimeType: "image/tiff", label: "TIFF", experimental: true, verification: "structural" },
  heic: { format: "heic", extension: "heic", mimeType: "image/heic", label: "HEIC / HEIF", experimental: true, verification: "structural" },
};

export const imageFormatFromFile = (file: Pick<File, "name" | "type">): ImageFormatInfo | null => {
  if (file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name)) return FORMAT_INFO.jpeg;
  if (file.type === "image/png" || /\.png$/i.test(file.name)) return FORMAT_INFO.png;
  if (file.type === "image/webp" || /\.webp$/i.test(file.name)) return FORMAT_INFO.webp;
  if (file.type === "image/tiff" || /\.tiff?$/i.test(file.name)) return FORMAT_INFO.tiff;
  if (/(image\/hei[cf]|image\/heif)/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) return FORMAT_INFO.heic;
  return null;
};

const concatBytes = (parts: Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
};
const standaloneArrayBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer;
const readBigEndianUint32 = (bytes: Uint8Array, offset: number): number => new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
const writeBigEndianUint32 = (value: number): Uint8Array => { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value); return bytes; };
const crc32 = (bytes: Uint8Array): number => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1; } return (value ^ 0xffffffff) >>> 0; };

const pngTextForITxt = (data: Uint8Array): { keyword: Uint8Array; text: Uint8Array } | null => {
  const separator = data.indexOf(0); if (separator < 1) return null;
  const keyword = data.subarray(0, separator); const sourceText = data.subarray(separator + 1);
  try { new TextDecoder("utf-8", { fatal: true }).decode(sourceText); return { keyword, text: sourceText }; }
  catch { return { keyword, text: new TextEncoder().encode(new TextDecoder("iso-8859-1").decode(sourceText)) }; }
};

/** Converts legacy PNG text chunks before the WASM writer sees them. */
export const normalizePngUtf8TextChunks = (buffer: ArrayBuffer): Uint8Array | null => {
  const source = new Uint8Array(buffer); const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((byte, index) => source[index] === byte)) return null;
  const parts: Uint8Array[] = [source.subarray(0, 8)]; let offset = 8; let changed = false;
  while (offset + 12 <= source.length) {
    const length = readBigEndianUint32(source, offset); const end = offset + 12 + length;
    if (end > source.length) return null;
    const type = String.fromCharCode(...source.subarray(offset + 4, offset + 8));
    const pngText = type === "tEXt" ? pngTextForITxt(source.subarray(offset + 8, offset + 8 + length)) : null;
    if (!pngText) parts.push(source.subarray(offset, end));
    else { const iTxtData = concatBytes([pngText.keyword, new Uint8Array([0, 0, 0, 0, 0]), pngText.text]); const typeBytes = new TextEncoder().encode("iTXt"); parts.push(writeBigEndianUint32(iTxtData.length), typeBytes, iTxtData, writeBigEndianUint32(crc32(concatBytes([typeBytes, iTxtData])))); changed = true; }
    offset = end; if (type === "IEND") return changed ? concatBytes(parts) : null;
  }
  return null;
};

export const fileForMetadataWrite = async (file: File, format: SupportedImageFormat): Promise<File> => {
  if (format !== "png") return file;
  const normalized = normalizePngUtf8TextChunks(await file.arrayBuffer());
  return normalized ? new File([standaloneArrayBuffer(normalized)], file.name, { type: file.type }) : file;
};

const jpegImageData = (bytes: Uint8Array): Uint8Array => {
  for (let index = 2; index < bytes.length - 4;) {
    if (bytes[index] !== 0xff) { index += 1; continue; }
    let markerIndex = index + 1; while (bytes[markerIndex] === 0xff) markerIndex += 1; const marker = bytes[markerIndex];
    if (marker === undefined || marker === 0x00) { index = markerIndex + 1; continue; }
    if (marker === 0xda) { const scanStart = markerIndex - 1; for (let offset = markerIndex + 1; offset + 1 < bytes.length; offset += 1) if (bytes[offset] === 0xff && bytes[offset + 1] === 0xd9) return bytes.subarray(scanStart, offset + 2); return bytes.subarray(scanStart); }
    if (marker === 0x01 || marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { index = markerIndex + 1; continue; }
    const length = (bytes[markerIndex + 1] << 8) | bytes[markerIndex + 2]; if (length < 2) break; index = markerIndex + 1 + length;
  }
  return bytes;
};
const pngImageData = (bytes: Uint8Array): Uint8Array => { const parts: Uint8Array[] = []; for (let offset = 8; offset + 12 <= bytes.length;) { const length = readBigEndianUint32(bytes, offset); const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)); const end = offset + 12 + length; if (end > bytes.length) return bytes; if (type === "IDAT") parts.push(bytes.subarray(offset + 4, end - 4)); offset = end; } return parts.length ? concatBytes(parts) : bytes; };
const webpImageData = (bytes: Uint8Array): Uint8Array => { const parts: Uint8Array[] = []; for (let offset = 12; offset + 8 <= bytes.length;) { const type = String.fromCharCode(...bytes.subarray(offset, offset + 4)); const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true); const end = offset + 8 + length; if (end > bytes.length) return bytes; if (["VP8 ", "VP8L"].includes(type)) parts.push(bytes.subarray(offset, end)); offset = end + (length % 2); } return parts.length ? concatBytes(parts) : bytes; };

type TiffLayout = { nextIfd: number; chunks: Uint8Array[] } | null;
const tiffLayout = (bytes: Uint8Array): TiffLayout => {
  if (bytes.length < 8) return null; const littleEndian = bytes[0] === 0x49 && bytes[1] === 0x49;
  if (!littleEndian && !(bytes[0] === 0x4d && bytes[1] === 0x4d)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); const u16 = (offset: number) => view.getUint16(offset, littleEndian); const u32 = (offset: number) => view.getUint32(offset, littleEndian);
  if (u16(2) !== 42) return null; // BigTIFF (43) is deliberately excluded.
  const ifd = u32(4); if (ifd + 2 > bytes.length) return null; const count = u16(ifd); const entriesEnd = ifd + 2 + count * 12; if (entriesEnd + 4 > bytes.length) return null;
  const typeSize: Record<number, number> = { 1: 1, 3: 2, 4: 4 };
  const values = (entry: number): number[] | null => { const type = u16(entry + 2); const amount = u32(entry + 4); const size = typeSize[type]; if (!size || amount > 100_000 || amount * size > bytes.length) return null; const dataOffset = amount * size <= 4 ? entry + 8 : u32(entry + 8); if (dataOffset + amount * size > bytes.length) return null; return Array.from({ length: amount }, (_, index) => type === 3 ? u16(dataOffset + index * size) : type === 4 ? u32(dataOffset + index * size) : bytes[dataOffset + index]); };
  let offsets: number[] | null = null; let lengths: number[] | null = null;
  for (let index = 0; index < count; index += 1) { const entry = ifd + 2 + index * 12; const tag = u16(entry); if (tag === 273 || tag === 324) offsets = values(entry); if (tag === 279 || tag === 325) lengths = values(entry); }
  if (!offsets || !lengths || offsets.length !== lengths.length || !offsets.length) return null;
  const chunks = offsets.map((offset, index) => offset + lengths![index] <= bytes.length ? bytes.subarray(offset, offset + lengths![index]) : null); if (chunks.some((chunk) => !chunk)) return null;
  return { nextIfd: u32(entriesEnd), chunks: chunks as Uint8Array[] };
};
const tiffImageData = (bytes: Uint8Array): Uint8Array => { const layout = tiffLayout(bytes); return layout ? concatBytes(layout.chunks) : bytes; };

const heifMdatData = (bytes: Uint8Array): Uint8Array | null => {
  if (bytes.length < 16 || String.fromCharCode(...bytes.subarray(4, 8)) !== "ftyp") return null;
  const ftypEnd = Math.min(readBigEndianUint32(bytes, 0), bytes.length);
  const compatibleBrands = [String.fromCharCode(...bytes.subarray(8, 12))];
  for (let offset = 16; offset + 4 <= ftypEnd; offset += 4) {
    compatibleBrands.push(String.fromCharCode(...bytes.subarray(offset, offset + 4)));
  }
  if (!compatibleBrands.some((brand) => ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand))) return null;
  const parts: Uint8Array[] = [];
  for (let offset = 0; offset + 8 <= bytes.length;) { const declaredSize = readBigEndianUint32(bytes, offset); const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)); let header = 8; let size = declaredSize; if (declaredSize === 1) { if (offset + 16 > bytes.length) return null; const high = readBigEndianUint32(bytes, offset + 8); const low = readBigEndianUint32(bytes, offset + 12); if (high || !low) return null; size = low; header = 16; } if (declaredSize === 0) size = bytes.length - offset; if (size < header || offset + size > bytes.length) return null; if (type === "mdat") parts.push(bytes.subarray(offset + header, offset + size)); offset += size; }
  return parts.length ? concatBytes(parts) : null;
};

export const formatSafetyFromBuffer = (buffer: ArrayBuffer, format: SupportedImageFormat): FormatSafety => {
  const bytes = new Uint8Array(buffer);
  if (format === "tiff") { const layout = tiffLayout(bytes); if (!layout) return { writable: false, reason: "仅支持包含标准 Strip/Tile 图像数据的经典单页 TIFF；BigTIFF、损坏文件和未识别 TIFF 将保持只读。" }; if (layout.nextIfd) return { writable: false, reason: "多页 TIFF 暂不支持写入，以避免改变其他页面。" }; return { writable: true }; }
  if (format === "heic" && !heifMdatData(bytes)) return { writable: false, reason: "文件不是可验证的 HEIC / HEIF 容器，或不含可识别的图像数据。" };
  return { writable: true };
};

export const imageDataPayload = (buffer: ArrayBuffer, format: SupportedImageFormat): Uint8Array => {
  const bytes = new Uint8Array(buffer); if (format === "jpeg") return jpegImageData(bytes); if (format === "png") return pngImageData(bytes); if (format === "webp") return webpImageData(bytes); if (format === "tiff") return tiffImageData(bytes); return heifMdatData(bytes) ?? bytes;
};
export const imageDataDigest = async (file: Blob, format: SupportedImageFormat): Promise<string> => { const payload = imageDataPayload(await file.arrayBuffer(), format); const digest = await crypto.subtle.digest("SHA-256", payload as unknown as BufferSource); return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join(""); };
