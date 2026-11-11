// ============================================
// FILE: src/components/auth/ConsentCheckbox.jsx
// "I agree to the Terms of Use and Privacy Statement." on both login pages.
// Unchecked by default and never remembered: it is asked at every sign-in,
// and nothing about it is stored.
//
// The whole sentence is the checkbox's label, so its accessible name is the
// full agreement. The two links sit inside that label; each stops its click
// from reaching the label, so opening a link never ticks or unticks the box.
// ============================================

const LINK = 'font-semibold underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0062cc]';
const stop = (e) => e.stopPropagation();

const ConsentCheckbox = ({ checked, onChange, error = false, id, inputRef }) => {
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="flex min-h-10 cursor-pointer items-center gap-3 text-base md:text-sm" style={{ color: '#374151' }}>
        <input
          id={id}
          ref={inputRef}
          type="checkbox"
          name="consent"
          checked={checked}
          onChange={onChange}
          aria-invalid={error || undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-5 w-5 shrink-0 cursor-pointer rounded accent-[#0062cc] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0062cc] focus-visible:ring-offset-2"
        />
        <span>
          I agree to the{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" onClick={stop} className={LINK} style={{ color: '#0062cc' }}>Terms of Use</a>
          {' '}and{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" onClick={stop} className={LINK} style={{ color: '#0062cc' }}>Privacy Statement</a>.
        </span>
      </label>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-sm" style={{ color: '#b91c1c' }}>
          Please agree to the Terms of Use and Privacy Statement to sign in.
        </p>
      )}
    </div>
  );
};

export default ConsentCheckbox;
