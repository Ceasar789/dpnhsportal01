// ============================================
// FILE: src/pages/auth/ChangePassword.jsx
// PURPOSE: Signed-in password change (every role: Teacher, Student, Admin
// reach it from Profile & password).
// P2: three steps.
//   1. details  current password + new password (live checklist) + confirm
//               (+ the optional security check). The current password is
//               checked, then Supabase emails a code.
//   2. code     the emailed code; "Send a new code" after a cooldown.
//   3. done     the password changed; other devices signed out.
// Only fixed sentences are shown (friendlyError); nothing typed is logged.
// ============================================

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, MailCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { validatePassword, PASSWORD_RULES } from '../../lib/passwordPolicy';
import { friendlyError } from '../../lib/friendlyError';
import {
  CHANGE_MESSAGES, CODE_COOLDOWN_SECONDS, CODE_PATTERN, changePassword, sendPasswordCode, verifyCurrentPassword,
} from '../../lib/passwordSecurity';
import { CAPTCHA_MESSAGES, turnstileSiteKey } from '../../lib/turnstile';
import Field from '../../components/ui/form/Field';
import PasswordField from '../../components/ui/form/PasswordField';
import FormErrorSummary from '../../components/ui/form/FormErrorSummary';
import TurnstileWidget from '../../components/ui/form/TurnstileWidget';
import FlippingLogo from '../../components/FlippingLogo';

const IDS = Object.freeze({
  current: 'change-current-password',
  password: 'change-new-password',
  confirm: 'change-confirm-password',
  code: 'change-code',
});

// Which step and field a Supabase answer belongs to.
const FIELD_FOR_CODE = Object.freeze({
  current_password_mismatch: ['details', IDS.current],
  current_password_required: ['details', IDS.current],
  weak_password: ['details', IDS.password],
  same_password: ['details', IDS.password],
  reauthentication_not_valid: ['code', IDS.code],
  reauthentication_needed: ['code', IDS.code],
});

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const Banner = ({ tone, children }) => {
  const ok = tone === 'ok';
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  return (
    <div role={ok ? 'status' : 'alert'} className="flex items-start gap-2 p-3 rounded-md mb-4 min-w-0"
      style={{ backgroundColor: ok ? '#d1fae5' : '#fee2e2' }}>
      <Icon size={18} className="shrink-0 mt-0.5" style={{ color: ok ? '#065f46' : '#b91c1c' }} aria-hidden="true" />
      <p className="text-sm flex-1 min-w-0 break-words" style={{ color: ok ? '#065f46' : '#b91c1c' }}>{children}</p>
    </div>
  );
};

const PRIMARY = 'w-full min-h-12 px-4 py-2 rounded-md text-white font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-50';
const QUIET = 'inline-flex items-center justify-center min-h-11 text-sm px-3 rounded disabled:opacity-60';

const ChangePassword = () => {
  const navigate = useNavigate();
  const { userData } = useAuth();
  const [step, setStep] = useState('details');
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState({});
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [othersSignedOut, setOthersSignedOut] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const needsCaptcha = Boolean(turnstileSiteKey());
  const heading = useRef(null);

  // One timer for the resend cooldown.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // Each new step starts at its own heading (keyboard and screen reader).
  useEffect(() => { if (step !== 'details') heading.current?.focus(); }, [step]);

  const showErrors = (list) => { setErrors(list); setAttempt((a) => a + 1); };

  const run = async (work) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailure('');
    try { await work(); } finally { busyRef.current = false; setBusy(false); }
  };

  const placeError = (err, fallback) => {
    const target = FIELD_FOR_CODE[err?.code];
    const message = friendlyError(err, { fallback });
    if (target) {
      const [where, fieldId] = target;
      setStep(where);
      showErrors({ [fieldId]: message });
    } else {
      setFailure(message);
    }
  };

  const sendCode = async (again) => {
    await sendPasswordCode();
    setCooldown(CODE_COOLDOWN_SECONDS);
    setNotice(again ? CHANGE_MESSAGES.codeResent : CHANGE_MESSAGES.codeSent);
  };

  const submitDetails = (e) => {
    e.preventDefault();
    const found = {};
    if (!current) found[IDS.current] = CHANGE_MESSAGES.currentRequired;
    const policy = validatePassword(password);
    if (policy) found[IDS.password] = policy;
    else if (current && password === current) found[IDS.password] = CHANGE_MESSAGES.sameAsCurrent;
    if (!found[IDS.password] && password !== confirmPassword) found[IDS.confirm] = CHANGE_MESSAGES.mismatch;
    if (Object.keys(found).length) { showErrors(found); return; }
    if (needsCaptcha && !captchaToken) { setFailure(CAPTCHA_MESSAGES.needed); return; }
    setErrors({});
    run(async () => {
      try {
        await verifyCurrentPassword(current, { captchaToken });
      } catch (err) {
        setCaptchaReset((n) => n + 1);
        placeError(err, CHANGE_MESSAGES.failed);
        return;
      }
      setCaptchaReset((n) => n + 1);
      try {
        // A code sent moments ago is still good: no second email inside the cooldown.
        if (cooldown <= 0) { await sendCode(false); setCode(''); }
        setStep('code');
      } catch (err) {
        setFailure(friendlyError(err, { fallback: CHANGE_MESSAGES.sendFailed }));
      }
    });
  };

  const resend = () => run(async () => {
    try { await sendCode(true); } catch (err) { setFailure(friendlyError(err, { fallback: CHANGE_MESSAGES.sendFailed })); }
  });

  const submitCode = (e) => {
    e.preventDefault();
    const typed = code.replace(/\s/g, '');
    if (!typed) { showErrors({ [IDS.code]: CHANGE_MESSAGES.codeNeeded }); return; }
    if (!CODE_PATTERN.test(typed)) { showErrors({ [IDS.code]: CHANGE_MESSAGES.codeFormat }); return; }
    setErrors({});
    run(async () => {
      try {
        const result = await changePassword({ password, code: typed, currentPassword: current });
        setOthersSignedOut(result?.othersSignedOut !== false);
        setCurrent(''); setPassword(''); setConfirmPassword(''); setCode('');
        setStep('done');
      } catch (err) {
        placeError(err, CHANGE_MESSAGES.failed);
      }
    });
  };

  const summary = Object.entries(errors).map(([fieldId, message]) => ({ fieldId, message }));
  const headingEl = (text) => (
    <h2 ref={heading} tabIndex={-1} className="text-lg font-bold mb-2 outline-none break-words" style={{ color: '#1a2b4a' }}>{text}</h2>
  );

  return (
    <div className="min-h-screen flex items-center justify-center relative py-6"
      style={{ backgroundImage: 'url(/capstonebackground.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative z-10 w-full max-w-md mx-4 min-w-0">
        <div className="bg-white rounded-lg p-6 sm:p-10 shadow-sm">
          <div className="flex flex-col items-center mb-6">
            <FlippingLogo size={60} />
            <h1 className="text-2xl font-bold mt-4 text-center break-words" style={{ color: '#1a2b4a' }}>Change Password</h1>
            <div className="w-10 h-1 mt-2" style={{ backgroundColor: '#d4a843' }} />
            {userData?.email && (
              <p className="text-sm mt-2 max-w-full text-center [overflow-wrap:anywhere]" style={{ color: '#6B7280' }}>{userData.email}</p>
            )}
          </div>

          {step === 'done' ? (
            <div className="flex flex-col gap-4 min-w-0" data-step="done">
              {headingEl(CHANGE_MESSAGES.done)}
              <Banner tone={othersSignedOut ? 'ok' : 'warn'}>
                {othersSignedOut ? CHANGE_MESSAGES.othersOut : CHANGE_MESSAGES.othersUnknown}
              </Banner>
              <button type="button" onClick={() => navigate(-1)} className={PRIMARY} style={{ backgroundColor: '#0d2b5c' }}>Done</button>
            </div>
          ) : (
            <>
              <FormErrorSummary id="change-password-summary" errors={summary} attempt={attempt} focusTo="first-field" />
              {failure && <Banner tone="error">{failure}</Banner>}

              {step === 'details' && (
                <form onSubmit={submitDetails} noValidate className="flex flex-col gap-1 min-w-0" data-step="details">
                  <PasswordField id={IDS.current} name="current-password" label="CURRENT PASSWORD" autoComplete="current-password"
                    value={current} onChange={(e) => setCurrent(e.target.value)} error={errors[IDS.current]} />
                  <PasswordField id={IDS.password} name="change-new-password" label="NEW PASSWORD" value={password}
                    onChange={(e) => setPassword(e.target.value)} rules={PASSWORD_RULES} error={errors[IDS.password]} />
                  <PasswordField id={IDS.confirm} name="change-confirm-password" label="CONFIRM NEW PASSWORD" value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)} error={errors[IDS.confirm]} />
                  <p className="text-sm mb-4 break-words" style={{ color: '#4b5563' }}>
                    Next, we email you a code to confirm it is you.
                  </p>
                  <TurnstileWidget onToken={setCaptchaToken} resetSignal={captchaReset} action="change-password" />
                  <button type="submit" disabled={busy} aria-busy={busy || undefined} className={PRIMARY} style={{ backgroundColor: '#0d2b5c' }}>
                    {busy ? 'Sending code…' : 'Send code'}
                  </button>
                </form>
              )}

              {step === 'code' && (
                <form onSubmit={submitCode} noValidate className="flex flex-col gap-1 min-w-0" data-step="code">
                  {headingEl('Check your email')}
                  {notice && (
                    <div role="status" className="flex items-start gap-2 p-3 rounded-md mb-4 min-w-0" style={{ backgroundColor: '#eff6ff' }}>
                      <MailCheck size={18} className="shrink-0 mt-0.5" style={{ color: '#1e3a8a' }} aria-hidden="true" />
                      <p className="text-sm flex-1 min-w-0 break-words" style={{ color: '#1e3a8a' }}>{notice}</p>
                    </div>
                  )}
                  <Field label="CODE FROM THE EMAIL" id={IDS.code} error={errors[IDS.code]}>
                    <input type="text" inputMode="numeric" autoComplete="one-time-code" name="code" maxLength={12}
                      spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} />
                  </Field>
                  <button type="submit" disabled={busy} aria-busy={busy || undefined} className={PRIMARY} style={{ backgroundColor: '#0d2b5c' }}>
                    {busy ? 'Changing password…' : 'Change password'}
                  </button>
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                    <button type="button" onClick={() => { setErrors({}); setFailure(''); setStep('details'); }} className={QUIET} style={{ color: '#4b5563' }}>
                      ← Edit passwords
                    </button>
                    <button type="button" onClick={resend} disabled={busy || cooldown > 0} className={QUIET} style={{ color: '#0d2b5c' }}>
                      {cooldown > 0 ? `Send a new code in ${mmss(cooldown)}` : 'Send a new code'}
                    </button>
                  </div>
                </form>
              )}

              <div className="flex justify-center mt-5">
                <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center min-h-11 text-sm px-2 rounded" style={{ color: '#6c757d' }}>
                  ← Go back
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChangePassword;
