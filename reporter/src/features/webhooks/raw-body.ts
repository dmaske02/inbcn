export type BoundedBodyResult =
  | Readonly<{ ok: true; rawBody: string }>
  | Readonly<{ ok: false; status: 400 | 413 }>;

export async function readBoundedRawBody(
  request: Request,
  maximumBytes: number,
): Promise<BoundedBodyResult> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/u.test(declaredLength)) return { ok: false, status: 400 };
    if (Number(declaredLength) > maximumBytes) return { ok: false, status: 413 };
  }
  if (!request.body) return { ok: false, status: 400 };

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;
  let rawBody = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maximumBytes) {
        try {
          await reader.cancel();
        } catch {
          // Size rejection remains authoritative if cancellation fails.
        }
        return { ok: false, status: 413 };
      }
      rawBody += decoder.decode(value, { stream: true });
    }
    rawBody += decoder.decode();
  } catch {
    try {
      await reader.cancel();
    } catch {
      // The body is already unusable and is never retained.
    }
    return { ok: false, status: 400 };
  }
  return rawBody ? { ok: true, rawBody } : { ok: false, status: 400 };
}
