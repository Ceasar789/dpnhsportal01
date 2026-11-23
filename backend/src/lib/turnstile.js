// P2: server check of the optional Cloudflare Turnstile token.
// Off (returns true) while TURNSTILE_SECRET_KEY is not set, so the route
// behaves exactly as before. Once the secret is set it fails closed: a
// missing, bad or unverifiable token (Cloudflare unreachable, timeout) is
// refused. The secret and the token are never logged.
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token, {
  secret = process.env.TURNSTILE_SECRET_KEY,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8000,
} = {}) {
  if (!secret) return true;
  if (typeof token !== 'string' || !token.trim() || token.length > 2048) return false;
  try {
    const response = await fetchImpl(VERIFY_URL, {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result?.success === true;
  } catch {
    return false;
  }
}
