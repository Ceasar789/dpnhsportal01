// ============================================
// FILE: src/lib/turnstile.js
// P2: optional Cloudflare Turnstile. It is on only when the build has
// VITE_TURNSTILE_SITE_KEY. With no key nothing loads and every page
// behaves exactly as before. The script is loaded once, on demand, from
// Cloudflare (explicit render, so it never scans the page by itself).
// Tokens are never logged or stored.
// ============================================

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** The site key, read at call time (so tests can switch it). '' = off. */
export const turnstileSiteKey = () => String(import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();

let loading = null;

/** Resolves with window.turnstile; rejects when the script cannot load. */
export function loadTurnstile() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')));
      script.onerror = () => { loading = null; script.remove(); reject(new Error('turnstile load failed')); };
      document.head.appendChild(script);
    });
  }
  return loading;
}

export const CAPTCHA_MESSAGES = Object.freeze({
  needed: 'Complete the security check first.',
  unavailable: "The security check couldn't load. Check your connection, then reload the page.",
});
