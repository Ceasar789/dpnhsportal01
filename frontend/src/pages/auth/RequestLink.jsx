// ============================================
// FILE: src/pages/auth/RequestLink.jsx
// P1: /request-link, the public "send me a new link" page for an invited
// person whose link expired or was used before they set a password. The
// answer is the same for every address (no account lookup from outside).
// ============================================

import { Link, useLocation } from 'react-router-dom';
import { AuthCard, RequestLinkForm } from './LinkProblem';

export default function RequestLink() {
  const { state } = useLocation();
  const initialEmail = typeof state?.email === 'string' ? state.email : '';
  return (
    <AuthCard title="Get a new link" intro="Enter the email address your invitation was sent to. We'll send a new link to set your password.">
      <RequestLinkForm initialEmail={initialEmail} />
      <div className="flex justify-center mt-4">
        <Link to="/login" className="inline-flex items-center min-h-11 text-sm px-2 rounded" style={{ color: '#4b5563' }}>
          ← Back to login
        </Link>
      </div>
    </AuthCard>
  );
}
