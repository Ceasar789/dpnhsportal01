// ============================================
// FILE: src/components/clarity/useClarityFlag.js
// The Clarity preview flag. OFF unless turned on.
//   ?clarity=1  turns it on and remembers it (localStorage smartedu-clarity=1)
//   ?clarity=0  turns it off and forgets it
//   otherwise   the remembered value decides
// Storage can throw or be blocked (private mode, policies): then the query
// parameter alone decides for that page load. Other query parameters are
// never touched.
// ============================================

import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export const CLARITY_STORAGE_KEY = 'smartedu-clarity';

const store = () => {
  try { return window.localStorage; } catch { return null; }
};

export const readStoredFlag = () => {
  try { return store()?.getItem(CLARITY_STORAGE_KEY) === '1'; } catch { return false; }
};

const writeStoredFlag = (on) => {
  try {
    if (on) store()?.setItem(CLARITY_STORAGE_KEY, '1');
    else store()?.removeItem(CLARITY_STORAGE_KEY);
  } catch { /* storage unavailable: the query parameter decides */ }
};

/** '1' or '0' from the query string, or null for anything else. */
export const clarityParam = (search) => {
  const value = new URLSearchParams(search || '').get('clarity');
  return value === '1' || value === '0' ? value : null;
};

/** On or off for this location: the parameter wins, else the stored value. */
export const resolveClarityFlag = (search, stored) => {
  const param = clarityParam(search);
  if (param === '1') return true;
  if (param === '0') return false;
  return Boolean(stored);
};

export function useClarityFlag() {
  const location = useLocation();
  const navigate = useNavigate();
  const param = clarityParam(location.search);
  const enabled = resolveClarityFlag(location.search, readStoredFlag());

  useEffect(() => {
    if (param === '1') writeStoredFlag(true);
    else if (param === '0') writeStoredFlag(false);
  }, [param]);

  // "Classic view": forget the flag and say so in the URL (?clarity=0),
  // keeping every other parameter as it was.
  const turnOff = useCallback(() => {
    writeStoredFlag(false);
    const params = new URLSearchParams(location.search);
    params.set('clarity', '0');
    navigate({ pathname: location.pathname, search: `?${params.toString()}`, hash: location.hash }, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate]);

  return { enabled, turnOff };
}
