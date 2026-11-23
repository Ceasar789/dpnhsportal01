// @vitest-environment jsdom
// P1: link parsing, why a link failed, the "used here" memory, request-link.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./backendApi', () => ({ API_BASE: 'https://api.example.test' }));
const {
  isLinkRejection, linkErrorCode, linkProblemKind, parseConfirmLink, rememberUsedLink, requestNewLink, wasLinkUsedHere,
} = await import('./authLinks');

const HASH = 'a'.repeat(56);
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

describe('parseConfirmLink (new format)', () => {
  it('accepts token_hash + type invite or recovery', () => {
    expect(parseConfirmLink(`?token_hash=${HASH}&type=invite`)).toEqual({ tokenHash: HASH, type: 'invite' });
    expect(parseConfirmLink(`?type=recovery&token_hash=pkce_${HASH}`)).toEqual({ tokenHash: `pkce_${HASH}`, type: 'recovery' });
  });
  it.each([
    '', '?type=invite', `?token_hash=${HASH}`, `?token_hash=${HASH}&type=signup`, `?token_hash=${HASH}&type=magiclink`,
    '?token_hash=short&type=invite', `?token_hash=${HASH}%22%3E%3Cscript%3E&type=invite`, `?token_hash=${'a'.repeat(300)}&type=invite`,
  ])('refuses %j', (search) => {
    expect(parseConfirmLink(search)).toBeNull();
  });
});

describe('old format error codes', () => {
  it('reads error_code from the hash, "unknown" for an error without one, null for none', () => {
    expect(linkErrorCode('#error=access_denied&error_code=otp_expired&error_description=Email+link')).toBe('otp_expired');
    expect(linkErrorCode('#error=server_error')).toBe('unknown');
    expect(linkErrorCode('#access_token=x')).toBeNull();
    expect(linkErrorCode('')).toBeNull();
  });
});

describe('expired vs used vs invalid', () => {
  it('otp_expired is expired, or used when this browser used the link', () => {
    expect(linkProblemKind('otp_expired')).toBe('expired');
    expect(linkProblemKind('flow_state_expired')).toBe('expired');
    expect(linkProblemKind('otp_expired', true)).toBe('used');
  });
  it('anything else is invalid', () => {
    for (const code of [null, undefined, 'unknown', 'validation_failed', 'bad_jwt', 'otp_disabled']) expect(linkProblemKind(code)).toBe('invalid');
  });
  it('remembers a used link by a short hash, never the token itself', () => {
    expect(wasLinkUsedHere(HASH)).toBe(false);
    rememberUsedLink(HASH);
    expect(wasLinkUsedHere(HASH)).toBe(true);
    expect(wasLinkUsedHere('b'.repeat(56))).toBe(false);
    expect(localStorage.getItem('smartedu-used-links')).not.toContain(HASH);
  });
  it('works without storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => rememberUsedLink(HASH)).not.toThrow();
    expect(wasLinkUsedHere(HASH)).toBe(false);
    vi.restoreAllMocks();
  });
  it('a link rejection is a 4xx or a coded auth error, not the network or a rate limit', () => {
    expect(isLinkRejection({ status: 403, code: 'otp_expired' })).toBe(true);
    expect(isLinkRejection({ status: 400 })).toBe(true);
    expect(isLinkRejection({ status: 0, name: 'AuthRetryableFetchError' })).toBe(false);
    expect(isLinkRejection({ status: 429, code: 'over_request_rate_limit' })).toBe(false);
    expect(isLinkRejection(new TypeError('Failed to fetch'))).toBe(false);
  });
});

describe('requestNewLink', () => {
  it('posts the trimmed email to the public route without credentials', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetch);
    await requestNewLink('  ana@school.test ');
    expect(fetch).toHaveBeenCalledWith('https://api.example.test/api/onboarding/request-link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ana@school.test' }),
    });
  });
  it('throws with the status, not the server text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 })));
    await expect(requestNewLink('a@b.co')).rejects.toMatchObject({ status: 429, message: 'request-link failed' });
  });
});
