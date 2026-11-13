// ============================================
// FILE: src/components/clarity/useClarityFlag.js
// The Clarity design flag. ON, everywhere (desktop and phone).
//   ?clarity=0  a hidden rollback for THIS TAB SESSION only
//               (sessionStorage smartedu-clarity=0); nothing is written to
//               localStorage, so it never sticks across tabs or visits
//   ?clarity=1  clears that rollback
//   otherwise   on, unless this tab session has the rollback
// A stale localStorage smartedu-clarity='0' (written by the removed "Classic
// view" button or by ?clarity=0 before G0) is ignored and removed on load.
// Storage can throw or be blocked (private mode, policies): then the query
// parameter alone decides for that page load, else the default (on). Other
// query parameters are never touched.
// ============================================

import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export const CLARITY_STORAGE_KEY = 'smartedu-clarity';

const local = () => {
  try { return window.localStorage; } catch { return null; }
};
const session = () => {
  try { return window.sessionStorage; } catch { return null; }
};

/** false when this tab session holds the ?clarity=0 rollback, else null (no rollback: on). */
export const readStoredFlag = () => {
  try {
    return session()?.getItem(CLARITY_STORAGE_KEY) === '0' ? false : null;
  } catch { return null; }
};

const setRollback = (off) => {
  try {
    const s = session();
    if (!s) return;
    if (off) s.setItem(CLARITY_STORAGE_KEY, '0');
    else s.removeItem(CLARITY_STORAGE_KEY);
  } catch { /* storage unavailable: the query parameter decides */ }
};

// The old persisted "off" must not keep anyone on the classic design.
const clearStaleOff = () => {
  try {
    const l = local();
    if (l && l.getItem(CLARITY_STORAGE_KEY) === '0') l.removeItem(CLARITY_STORAGE_KEY);
  } catch { /* storage unavailable: nothing to clear */ }
};

/** '1' or '0' from the query string, or null for anything else. */
export const clarityParam = (search) => {
  const value = new URLSearchParams(search || '').get('clarity');
  return value === '1' || value === '0' ? value : null;
};

/** On or off for this location: the parameter wins, else the session rollback, else on. */
export const resolveClarityFlag = (search, stored) => {
  const param = clarityParam(search);
  if (param === '1') return true;
  if (param === '0') return false;
  return stored == null ? true : Boolean(stored);
};

export function useClarityFlag() {
  const location = useLocation();
  const navigate = useNavigate();
  const param = clarityParam(location.search);
  const enabled = resolveClarityFlag(location.search, readStoredFlag());

  useEffect(() => { clearStaleOff(); }, []);
  useEffect(() => {
    if (param === '1') setRollback(false);
    else if (param === '0') setRollback(true);
  }, [param]);

  // The hidden rollback (no visible button calls it since G1): this tab
  // session only, said in the URL (?clarity=0), every other parameter kept.
  const turnOff = useCallback(() => {
    setRollback(true);
    const params = new URLSearchParams(location.search);
    params.set('clarity', '0');
    navigate({ pathname: location.pathname, search: `?${params.toString()}`, hash: location.hash }, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate]);

  return { enabled, turnOff };
}
