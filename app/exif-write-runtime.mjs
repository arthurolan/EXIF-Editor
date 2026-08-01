const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];

export function resolveExifToolWasmUrl(baseUri) {
  return new URL("zeroperl.wasm", baseUri).href;
}

export async function fetchVerifiedExifToolWasm(wasmUrl, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(wasmUrl, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`EXIF_WASM_HTTP_${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.length < WASM_MAGIC.length ||
    !WASM_MAGIC.every((expected, index) => bytes[index] === expected)
  ) {
    throw new Error("EXIF_WASM_INVALID_CONTENT");
  }

  return new Response(bytes, {
    status: 200,
    headers: { "content-type": "application/wasm" },
  });
}
