// Viewport height for inline styles. On phones 100vh is the height with the
// browser toolbars hidden, so a full-height box runs behind the toolbar;
// dvh follows the visible area. An inline style cannot list a fallback
// declaration the way CSS can, so the unit is chosen once here: dvh where
// the browser supports it, vh everywhere else (identical on desktop).
const supportsDvh = (supports = globalThis.CSS?.supports) => {
  try { return Boolean(supports?.('height', '100dvh')); } catch { return false; }
};

export const VIEWPORT_HEIGHT_UNIT = supportsDvh() ? 'dvh' : 'vh';

export const viewportHeight = (percent = 100, unit = VIEWPORT_HEIGHT_UNIT) => `${percent}${unit}`;

export const __test = { supportsDvh };
