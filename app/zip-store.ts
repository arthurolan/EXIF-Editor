export type ZipSource = { name: string; file: Blob };

const encoder = new TextEncoder();

const crc32 = (bytes: Uint8Array): number => {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
};

const write16 = (view: DataView, offset: number, value: number) => view.setUint16(offset, value, true);
const write32 = (view: DataView, offset: number, value: number) => view.setUint32(offset, value, true);
const blobBytes = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer;

const dosDateTime = (timestamp: number): [number, number] => {
  const date = new Date(timestamp);
  const year = Math.max(1980, date.getFullYear());
  return [
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  ];
};

const uniqueEntryNames = (sources: ZipSource[]): string[] => {
  const seen = new Map<string, number>();
  return sources.map(({ name }, index) => {
    const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_") || `photo-${index + 1}`;
    const count = seen.get(safe) ?? 0;
    seen.set(safe, count + 1);
    if (!count) return safe;
    const extension = safe.lastIndexOf(".");
    return extension > 0 ? `${safe.slice(0, extension)} (${count})${safe.slice(extension)}` : `${safe} (${count})`;
  });
};

/** Creates an uncompressed standard ZIP, preserving photo bytes without recompression. */
export const createStoredZip = async (
  sources: ZipSource[],
  onProgress?: (completed: number, total: number) => void,
): Promise<Blob> => {
  if (!sources.length) throw new Error("No verified files are available for ZIP delivery.");
  if (sources.length > 65535) throw new Error("Too many files for a standard ZIP archive.");

  const parts: BlobPart[] = [];
  const centralParts: Uint8Array[] = [];
  const names = uniqueEntryNames(sources);
  let offset = 0;
  for (let index = 0; index < sources.length; index += 1) {
    const { file } = sources[index];
    if (file.size > 0xffffffff || offset + file.size > 0xffffffff) throw new Error("Batch is too large for a standard ZIP archive.");
    const name = encoder.encode(names[index]);
    const data = new Uint8Array(await file.arrayBuffer());
    const checksum = crc32(data);
    const [time, date] = dosDateTime(file instanceof File ? file.lastModified : Date.now());
    const local = new Uint8Array(30);
    const localView = new DataView(local.buffer);
    write32(localView, 0, 0x04034b50); write16(localView, 4, 20); write16(localView, 6, 0x0800); write16(localView, 8, 0);
    write16(localView, 10, time); write16(localView, 12, date); write32(localView, 14, checksum); write32(localView, 18, file.size);
    write32(localView, 22, file.size); write16(localView, 26, name.length); write16(localView, 28, 0);
    parts.push(blobBytes(local), blobBytes(name), file);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    write32(centralView, 0, 0x02014b50); write16(centralView, 4, 20); write16(centralView, 6, 20); write16(centralView, 8, 0x0800); write16(centralView, 10, 0);
    write16(centralView, 12, time); write16(centralView, 14, date); write32(centralView, 16, checksum); write32(centralView, 20, file.size);
    write32(centralView, 24, file.size); write16(centralView, 28, name.length); write16(centralView, 30, 0); write16(centralView, 32, 0);
    write16(centralView, 34, 0); write16(centralView, 36, 0); write32(centralView, 38, 0); write32(centralView, 42, offset);
    central.set(name, 46); centralParts.push(central);
    offset += local.length + name.length + file.size;
    onProgress?.(index + 1, sources.length);
  }

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50); write16(endView, 4, 0); write16(endView, 6, 0); write16(endView, 8, sources.length); write16(endView, 10, sources.length);
  write32(endView, 12, centralSize); write32(endView, 16, offset); write16(endView, 20, 0);
  return new Blob([...parts, ...centralParts.map(blobBytes), blobBytes(end)], { type: "application/zip" });
};
