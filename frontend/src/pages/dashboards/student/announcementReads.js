// Q7 / design p12 (4s): which announcements this student has marked as read.
// Kept on this device only (localStorage, per user): there is no read-receipt
// table, and announcements stay admin-posted. Clearing the browser data simply
// makes everything Unread again; nothing is lost.
import { useCallback, useState } from 'react';

const KEY = uid => `eduscribe.announcements.read.${uid}`;
const LIMIT = 500;

export function loadReadIds(uid, storage = globalThis.localStorage) {
  if (!uid) return new Set();
  try {
    const value = JSON.parse(storage?.getItem(KEY(uid)) || '[]');
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

export function saveReadIds(uid, ids, storage = globalThis.localStorage) {
  if (!uid) return;
  try { storage?.setItem(KEY(uid), JSON.stringify([...ids].slice(-LIMIT))); } catch { /* storage full or blocked: stays in memory */ }
}

export function useAnnouncementReads(uid) {
  const [state, setState] = useState(() => ({ uid, ids: loadReadIds(uid) }));
  const ids = state.uid === uid ? state.ids : loadReadIds(uid);
  if (state.uid !== uid) setState({ uid, ids });
  const markRead = useCallback((list) => {
    setState(previous => {
      const next = new Set(previous.ids);
      list.forEach(id => next.add(String(id)));
      saveReadIds(uid, next);
      return { uid, ids: next };
    });
  }, [uid]);
  return { isRead: item => ids.has(String(item?.id)), markRead };
}
