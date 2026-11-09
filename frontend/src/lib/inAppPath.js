// A notification's action_url as an in-app path, or null. Only relative or
// same-origin http(s) URLs are followed; anything else (another site,
// protocol-relative //host, javascript:, data:) is ignored.
export function inAppPath(url, origin = globalThis.location?.origin) {
  if (typeof url !== 'string' || !url.trim() || !origin) return null;
  try {
    const parsed = new URL(url.trim(), origin);
    if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
