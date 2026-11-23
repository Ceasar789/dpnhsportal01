// ============================================
// FILE: src/pages/auth/LinkProblem.jsx
// P1: what an invitation or set-password link shows when it did not work
// (expired, already used, not valid), with a form to ask for a new link
// right there. Also the card the link pages share, and the request form the
// /request-link page uses.
// ============================================

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import FlippingLogo from '../../components/FlippingLogo';
import Field from '../../components/ui/form/Field';
import FormErrorSummary from '../../components/ui/form/FormErrorSummary';
import { compose, email as emailRule, EMAIL_MESSAGE, required } from '../../lib/formRules';
import { friendlyError } from '../../lib/friendlyError';
import { LINK_PROBLEMS, REQUEST_LINK_MESSAGES, requestNewLink } from '../../lib/authLinks';
import TurnstileWidget from '../../components/ui/form/TurnstileWidget';
import { CAPTCHA_MESSAGES, turnstileSiteKey } from '../../lib/turnstile';

const checkEmail = compose(required(REQUEST_LINK_MESSAGES.emailRequired), emailRule());
const EMAIL_ID = 'request-link-email';

/** The auth pages' card: photo backdrop, logo, title. */
export function AuthCard({ title, intro, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center relative py-6"
      style={{ backgroundImage: 'url(/capstonebackground.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative z-10 w-full max-w-md mx-4 min-w-0">
        <div className="bg-white rounded-lg p-6 sm:p-10">
          <div className="flex flex-col items-center mb-6">
            <FlippingLogo size={60} />
            <h1 className="text-2xl font-bold mt-4 text-center break-words" style={{ color: '#1a2b4a' }}>{title}</h1>
            <div className="w-10 h-1 mt-2" style={{ backgroundColor: '#d4a843' }} />
            {intro && <p className="text-sm text-center mt-3 break-words" style={{ color: '#4b5563' }}>{intro}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Email field + "Request a new link". The answer never says whether the address has an account. */
export function RequestLinkForm({ initialEmail = '' }) {
  const [value, setValue] = useState(initialEmail);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState('');
  const [sent, setSent] = useState(false);
  // P2: optional security check; absent key = no widget, no token, as before.
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const busy = useRef(false);
  const [busyShown, setBusyShown] = useState(false);
  const done = useRef(null);
  useEffect(() => { if (sent) done.current?.focus(); }, [sent]);

  const submit = async (event) => {
    event.preventDefault();
    if (busy.current) return;
    const problem = checkEmail(value);
    if (problem) { setError(problem); setAttempt(a => a + 1); return; }
    setError(null);
    if (turnstileSiteKey() && !captchaToken) { setFailure(CAPTCHA_MESSAGES.needed); return; }
    setFailure('');
    busy.current = true;
    setBusyShown(true);
    try {
      await (captchaToken ? requestNewLink(value, { captchaToken }) : requestNewLink(value));
      setSent(true);
    } catch (err) {
      if (err?.status === 400 && err.code !== 'captcha_failed') { setError(EMAIL_MESSAGE); setAttempt(a => a + 1); }
      else setFailure(friendlyError(err, { fallback: REQUEST_LINK_MESSAGES.failed }));
    } finally {
      busy.current = false;
      setBusyShown(false);
      setCaptchaReset((n) => n + 1);
    }
  };

  if (sent) {
    return (
      <div ref={done} tabIndex={-1} role="status" className="flex items-start gap-2 p-3 rounded-md w-full outline-none" style={{ backgroundColor: '#d1fae5' }}>
        <CheckCircle2 size={18} className="shrink-0 mt-0.5" style={{ color: '#065f46' }} aria-hidden="true" />
        <p className="text-sm flex-1 min-w-0 break-words" style={{ color: '#065f46' }}>{REQUEST_LINK_MESSAGES.sent}</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="w-full min-w-0">
      <FormErrorSummary id="request-link-summary" errors={error ? [{ fieldId: EMAIL_ID, message: error }] : []} attempt={attempt} focusTo="first-field" />
      {failure && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-md mb-4" style={{ backgroundColor: '#fee2e2' }}>
          <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: '#b91c1c' }} aria-hidden="true" />
          <p className="text-sm flex-1 min-w-0" style={{ color: '#b91c1c' }}>{failure}</p>
        </div>
      )}
      <Field label="Email address" id={EMAIL_ID} error={error} validate={checkEmail} onValidate={(message) => { if (!message) setError(null); }}>
        <input type="email" inputMode="email" name="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
          value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <TurnstileWidget onToken={setCaptchaToken} resetSignal={captchaReset} action="request-link" />
      <button type="submit" aria-busy={busyShown || undefined}
        className="w-full min-h-12 px-4 py-2 rounded-md text-white font-semibold text-base hover:opacity-90 transition-opacity"
        style={{ backgroundColor: '#0d2b5c' }}>
        {busyShown ? 'Sending…' : 'Request a new link'}
      </button>
    </form>
  );
}

export default function LinkProblem({ kind = 'invalid', email = '' }) {
  const { title, body } = LINK_PROBLEMS[kind] || LINK_PROBLEMS.invalid;
  return (
    <div className="flex flex-col items-center gap-4 min-w-0" data-link-problem={kind}>
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center shrink-0">
        <AlertTriangle size={30} style={{ color: '#b91c1c' }} aria-hidden="true" />
      </div>
      <h2 className="text-lg font-bold text-center" style={{ color: '#b91c1c' }}>{title}</h2>
      <p className="text-sm text-center" style={{ color: '#4b5563' }}>{body}</p>
      <RequestLinkForm initialEmail={email} />
      <Link to="/login" className="inline-flex items-center min-h-11 text-sm px-2 rounded" style={{ color: '#4b5563' }}>
        ← Back to login
      </Link>
    </div>
  );
}
