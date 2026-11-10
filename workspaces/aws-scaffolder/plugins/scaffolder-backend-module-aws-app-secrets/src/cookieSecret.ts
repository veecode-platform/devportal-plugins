const COOKIE_SECRET_BYTES = 32;

/**
 * oauth2-proxy decodes URL-safe base64 back to bytes and uses them as the key
 * only when they are 16, 24 or 32 long; any other string is taken as raw text.
 * Standard base64 with `+` or `/` would therefore be read as a 44-byte string.
 */
export function newCookieSecret(randomBytes: (size: number) => Buffer): string {
  return randomBytes(COOKIE_SECRET_BYTES)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_');
}
