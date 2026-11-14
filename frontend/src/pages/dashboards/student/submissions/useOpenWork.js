// ============================================
// FILE: src/pages/dashboards/student/submissions/useOpenWork.js
// Opening a submitted file or link, shared by the student's Your work panel
// and the teacher's review dialog (S4).
//   - A link opens only if it is http(s), in a new tab with rel="noopener noreferrer".
//   - A file opens through a 60-second signed URL. If the browser blocks the
//     new tab (iOS Safari after an await), the caller's fallback "Open file"
//     link stays tappable for 55 seconds. The URL lives only on that link's
//     href, set through `fallbackRef`: never in React state, never logged.
// The caller renders the fallback link and keeps its own busy state.
// ============================================

import { useEffect, useRef, useState } from 'react';
import { openInNewTab } from '../../../../lib/uploadRules';
import { signedOwnFileUrl } from './attachmentApi';

const FALLBACK_MS = 55 * 1000;

export default function useOpenWork() {
  const [fallbackShown, setFallbackShown] = useState(false);
  const fallbackRef = useRef(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  // true when the link was opened (http/https only).
  const openLink = url => openInNewTab(url);

  // true when a signed URL was made and opened; false when it could not be made.
  const openFile = async (attachment) => {
    const url = await signedOwnFileUrl({ current: attachment });
    if (!url) return false;
    clearTimeout(timer.current);
    if (fallbackRef.current) fallbackRef.current.href = url;
    setFallbackShown(true);
    openInNewTab(url);
    timer.current = setTimeout(() => {
      fallbackRef.current?.removeAttribute('href');
      setFallbackShown(false);
    }, FALLBACK_MS);
    return true;
  };

  // Drops the fallback link at once (the teacher's dialog, when switching student).
  const clearFallback = () => {
    clearTimeout(timer.current);
    fallbackRef.current?.removeAttribute('href');
    setFallbackShown(false);
  };

  return { openFile, openLink, fallbackRef, fallbackShown, clearFallback };
}
