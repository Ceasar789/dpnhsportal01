// ============================================
// FILE: src/components/clarity/admin/useAdminPageUrl.js
// V2b-2: the Clarity admin page in the URL, so the phone Back gesture moves
// between pages, a refresh stays on the page and a link opens the right tab.
//   /admin-dashboard            -> Overview
//   /admin-dashboard/<page key> -> that page (the existing keys, unchanged)
// The query string (?clarity=...) is kept. Only active under a route with a
// splat ('/admin-dashboard/*', AppRoutes.jsx); a route without one (unit
// tests that mount '/admin-dashboard') keeps the state-only behaviour.
// setPage keeps its signature: every caller and every unsaved-changes guard
// runs before the page changes; the URL follows afterwards.
// ============================================

import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

export const ADMIN_PAGE_KEYS = ['users', 'subjects', 'teaching-load', 'sections', 'schedules', 'news', 'calendar', 'memos', 'settings', 'profile'];

// The page a path names, 'overview' for the bare path, null for an unknown one.
export const pageFromSplat = (splat = '') => {
  const key = String(splat).split('/').filter(Boolean)[0];
  if (!key) return 'overview';
  return ADMIN_PAGE_KEYS.includes(key) ? key : null;
};
export const pathForPage = page => (page === 'overview' ? '/admin-dashboard' : `/admin-dashboard/${page}`);

export function useAdminPageUrl({ page, setPage }) {
  const params = useParams();
  const enabled = Object.prototype.hasOwnProperty.call(params, '*');
  const urlPage = enabled ? pageFromSplat(params['*']) : undefined;
  const { search } = useLocation();
  const navigate = useNavigate();
  // The URL page last followed, and the page of the previous commit. Each
  // side reacts only to its OWN change, so the two never echo each other
  // (both effects also run on mount, in the same commit).
  const seenUrl = useRef(undefined);
  const lastPage = useRef(page);

  // URL -> page: first load, Back/Forward, a typed or shared link.
  useEffect(() => {
    if (!enabled || urlPage === seenUrl.current) return;
    seenUrl.current = urlPage;
    if (urlPage === null) {
      navigate({ pathname: '/admin-dashboard', search }, { replace: true });
      return;
    }
    if (urlPage !== page) setPage(urlPage);
  }, [enabled, urlPage]); // eslint-disable-line react-hooks/exhaustive-deps -- follows the URL only

  // page -> URL: a menu click, a button, a Getting started step. A page that
  // came from the URL already matches it, so nothing is pushed for it.
  useEffect(() => {
    if (page === lastPage.current) return;
    lastPage.current = page;
    if (enabled && urlPage !== null && page !== urlPage) navigate({ pathname: pathForPage(page), search });
  }, [enabled, page]); // eslint-disable-line react-hooks/exhaustive-deps -- follows the page only
}
