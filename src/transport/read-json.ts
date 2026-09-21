export class BodyTooLargeError extends Error {}

/** Bound bytes before allocating or parsing a complete HTTP body. */
export async function readJson(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<unknown> {
  const reader = body?.getReader();
  if (!reader) throw new SyntaxError("JSON body required.");
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new BodyTooLargeError("JSON body exceeds the size limit.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    reader.releaseLock();
  }
}
