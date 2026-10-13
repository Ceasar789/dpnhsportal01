import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { invitationCallbackDecision } from './invitationCallback';

const InvitationCallbackGuard = ({ children }) => {
  const location = useLocation();
  const { user, userData, loading } = useAuth();
  const decision = invitationCallbackDecision({
    pathname: location.pathname,
    hash: location.hash,
    user,
    profileStatus: userData?.status,
    loading,
  });

  if (decision?.destination) {
    const target = decision.preserveHash
      ? { pathname: decision.destination, hash: location.hash }
      : decision.destination;
    return <Navigate to={target} replace />;
  }

  // Supabase initializes the session from the callback fragment
  // asynchronously. Do not paint the landing page while that work is still
  // in progress; once AuthContext has the invited account, route it into the
  // existing password setup screen.
  if (decision?.pending) return null;

  return children;
};

export default InvitationCallbackGuard;
