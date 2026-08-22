import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyHmac(message: string, secret: string, signature: string): boolean {
  const expected = createHmac("sha256", secret).update(message).digest();
  const validFormat = /^[\da-f]{64}$/iu.test(signature);
  const received = validFormat
    ? Buffer.from(signature, "hex")
    : Buffer.alloc(expected.length);
  return timingSafeEqual(received, expected) && validFormat;
}
