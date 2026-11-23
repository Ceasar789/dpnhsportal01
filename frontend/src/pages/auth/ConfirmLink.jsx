// ============================================
// FILE: src/pages/auth/ConfirmLink.jsx
// P1: /auth/confirm?token_hash=...&type=invite|recovery, where the Supabase
// invitation and set-password emails now point. Opening the page does
// nothing with the token: it is checked (verifyOtp) only when the person
// presses "Set my password", so a mail scanner that opens the link cannot
// use it up. Then the existing password pages take over. The destination is
// one of two fixed paths; nothing from the URL decides where to go.
// ============================================

import { useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { email } from '../../lib/formRules';
import {
  isLinkRejection, linkProblemKind, parseConfirmLink, rememberUsedLink, wasLinkUsedHere,
} from '../../lib/authLinks';
import { isNotActivated } from '../../../../shared/inviteState.js';
import LinkProblem, { AuthCard } from './LinkProblem';

export default function ConfirmLink() {
  const location = useLocation();
  const navigate = useNavigate();
  const link = useMemo(() => parseConfirmLink(location.search), [location.search]);
  const [problem, setProblem] = useState(link ? null : 'invalid');
  const [failure, setFailure] = useState('');
  const busy = useRef(false);
  const [busyShown, setBusyShown] = useState(false);

  const confirm = async () => {
    if (busy.current || !link) return;
    busy.current = true;
    setBusyShown(true);
    setFailure('');
    try {
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
      if (error) {
        if (isLinkRejection(error)) setProblem(linkProblemKind(error.code, wasLinkUsedHere(link.tokenHash)));
        else setFailure(friendlyError(error));
        return;
      }
      rememberUsedLink(link.tokenHash);
      navigate(isNotActivated(undefined, data?.user) ? '/setup-password' : '/reset-password', { replace: true });
    } catch (error) {
      setFailure(friendlyError(error));
    } finally {
      busy.current = false;
      setBusyShown(false);
    }
  };

  if (problem) {
    // Prefilled only when the email template adds &email={{ .Email }} (optional).
    const known = new URLSearchParams(location.search).get('email') || '';
    return <AuthCard title="Link problem"><LinkProblem kind={problem} email={email()(known) ? '' : known} /></AuthCard>;
  }

  const invite = link.type === 'invite';
  return (
    <AuthCard
      title="Set your password"
      intro={invite
        ? 'You were invited to the DPNHS portal. Continue to create your password.'
        : 'Continue to choose a new password for your account.'}>
      {failure && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-md mb-4" style={{ backgroundColor: '#fee2e2' }}>
          <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: '#b91c1c' }} aria-hidden="true" />
          <p className="text-sm flex-1 min-w-0" style={{ color: '#b91c1c' }}>{failure}</p>
        </div>
      )}
      <button type="button" onClick={confirm} aria-busy={busyShown || undefined}
        className="w-full min-h-12 px-4 py-2 rounded-md text-white font-semibold text-base hover:opacity-90 transition-opacity"
        style={{ backgroundColor: '#0d2b5c' }}>
        {busyShown ? 'Checking your link…' : 'Set my password'}
      </button>
      <p className="text-sm text-center mt-4" style={{ color: '#4b5563' }}>
        The link works once. It is only checked when you press the button.
      </p>
      <div className="flex justify-center mt-2">
        <Link to="/login" className="inline-flex items-center min-h-11 text-sm px-2 rounded" style={{ color: '#4b5563' }}>
          ← Back to login
        </Link>
      </div>
    </AuthCard>
  );
}
