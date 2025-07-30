/**
 * Consume an NDJSON ReadableStream and invoke a callback for each parsed object.
 * @param stream ReadableStream<Uint8Array> from fetch response
 * @param onMessage callback invoked for each parsed JSON object
 * @param onError callback invoked on parse or stream errors
 * @param onComplete callback invoked when stream is fully consumed
 * @param signal optional AbortSignal to cancel processing
 */
export async function consumeStream(
  stream: ReadableStream<Uint8Array>,
  onMessage: (data: any) => void,
  onError?: (error: Error) => void,
  onComplete?: () => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        break;
      }

      const { value, done } = await reader.read();
      if (done) {
        onComplete?.();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop()!; // keep incomplete

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          onMessage(data);
        } catch (err) {
          onError?.(err as Error);
        }
      }
    }

    // any remaining
    if (buffer.trim()) {
      try {
        onMessage(JSON.parse(buffer));
      } catch (err) {
        onError?.(err as Error);
      }
    }
  } catch (err) {
    onError?.(err as Error);
  } finally {
    reader.releaseLock();
  }
}

/**
 * Read an NDJSON ReadableStream and return all raw lines once complete.
 * @param stream ReadableStream<Uint8Array>
 * @param signal optional AbortSignal to cancel processing
 * @returns Promise resolving to an array of non-empty raw lines
 */
export async function collectStreamLines(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const linesAccum: string[] = [];

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        break;
      }
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop()!;

      for (const line of parts) {
        if (line.trim()) linesAccum.push(line);
      }
    }

    // finalize leftover
    if (buffer.trim()) linesAccum.push(buffer);
    return linesAccum;
  } finally {
    reader.releaseLock();
  }
}
