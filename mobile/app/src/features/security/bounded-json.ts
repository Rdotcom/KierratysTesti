/** Fail closed before parsing oversized/unbounded network data. Requires a streaming fetch. */
export async function readBoundedJson(response: Response, maximumBytes: number): Promise<unknown> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
    throw Error("invalid_response_bound");
  if (!response.body || Number(response.headers.get("content-length")) > maximumBytes) {
    await response.body?.cancel();
    throw Error("response_bound");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maximumBytes) throw Error("response_bound");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
