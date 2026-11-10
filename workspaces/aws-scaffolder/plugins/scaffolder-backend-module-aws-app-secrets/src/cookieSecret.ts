const COOKIE_SECRET_BYTES = 32;

/**
 * A cookie secret for oauth2-proxy: 32 random bytes as URL-safe base64, the
 * form its documentation generates (`base64.urlsafe_b64encode(os.urandom(32))`).
 * The proxy decodes that form back to 32 bytes, a valid AES-256 key length.
 * Standard base64 with `+` or `/` would be read as a raw 44-byte string, which
 * is not a valid key length, and the proxy would refuse to start.
 */
export function newCookieSecret(randomBytes: (size: number) => Buffer): string {
  return randomBytes(COOKIE_SECRET_BYTES)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_');
}
