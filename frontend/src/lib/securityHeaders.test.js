// 4j (QA ID-188 / ID-189): vercel.json sends the security headers on every
// path, and the Content Security Policy is REPORT-ONLY (it logs, never blocks)
// until it has been watched in production.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const vercel = JSON.parse(readFileSync(resolve(here, '../../../vercel.json'), 'utf8'));
const block = (vercel.headers || []).find(h => h.source === '/(.*)');
const header = key => block?.headers.find(h => h.key === key)?.value;

describe('vercel.json security headers', () => {
  it('apply to every path', () => {
    expect(block).toBeTruthy();
  });
  it('frame, sniffing, HSTS, referrer and permissions headers', () => {
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('Strict-Transport-Security')).toMatch(/^max-age=\d{8,}; includeSubDomains$/);
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(header('Permissions-Policy')).toContain('camera=()');
  });
  it('the CSP is report-only, never enforcing, and allows what the app loads', () => {
    expect(header('Content-Security-Policy')).toBeUndefined();
    const csp = header('Content-Security-Policy-Report-Only');
    for (const part of ["default-src 'self'", 'https://*.supabase.co', 'wss://*.supabase.co',
      'https://challenges.cloudflare.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com',
      "object-src 'none'", "frame-ancestors 'none'"]) expect(csp).toContain(part);
    expect(csp).not.toMatch(/'unsafe-eval'/);
  });
  it('the API and SPA rewrites are unchanged', () => {
    expect(vercel.rewrites).toEqual([
      { source: '/api/(.*)', destination: '/api/index.js' },
      { source: '/(.*)', destination: '/index.html' },
    ]);
  });
});
