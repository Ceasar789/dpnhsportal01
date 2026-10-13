// ============================================
// FILE: src/components/ui/Button.jsx
//
// The variants the admin's CSS already declares — primary, ghost, danger,
// sm — given a name a call site can ask for, plus the two the audit found
// missing.
//
// UX-106: the confirmation dialog's destructive button invents a filled-red
// look by overriding .btn-primary's colours inline. That appearance now has
// a name (`danger-solid`) and lives here, so the next call site that needs
// it reaches for it instead of reinventing it.
//
// Rule B1 — a submit button is NOT disabled for an incomplete form. A
// disabled button drops out of the tab order and cannot explain itself; the
// form validates on press instead.
//
// Rule B2 — busy is not disabled either. While a request is in flight the
// button keeps focus and stays reachable, says "Saving…", and sets
// aria-busy. Double submits are blocked by a ref in the caller, not by the
// disabled attribute, because `disabled` would move focus to the body at
// the exact moment the user is waiting to hear what happened.
// ============================================

const VARIANT_CLASS = {
  primary: 'btn btn-primary',
  ghost: 'btn btn-ghost',
  // The existing .btn-danger is a borderless red text button — Rule B4's
  // demoted destructive trigger.
  danger: 'btn btn-danger',
  // Solid red, for the confirmation step only. B4 reserves it for there.
  'danger-solid': 'btn btn-primary btn-danger-solid',
};

export default function Button({
  variant = 'primary',
  size,
  busy = false,
  busyLabel = 'Saving…',
  className = '',
  children,
  ...rest
}) {
  const classes = [
    VARIANT_CLASS[variant] ?? VARIANT_CLASS.primary,
    size === 'sm' ? 'btn-sm' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={classes}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && <span className="spin ux-btn-spin" aria-hidden="true" />}
      {busy ? busyLabel : children}
    </button>
  );
}
