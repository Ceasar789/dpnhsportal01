// ============================================
// FILE: src/pages/dashboards/student/StudentDataContext.jsx
// Holds the one student task graph for the life of the dashboard shell.
//
// The shell does not remount when the student moves between Overview and
// Tasks — only the routed tab does — so state kept here survives that
// navigation. That is the whole point: the two screens used to re-issue
// almost the same nine queries at each other seconds apart.
//
// Deliberately NOT a cache with a TTL. A stale answer on this dashboard is
// the exact failure this project keeps having to fix, so the data refreshes
// only when something asks it to: the tab mounts for the first time, the
// student hits Refresh, or a write completes (submitting a task). Nothing
// here expires on a timer and quietly serves an old answer.
// ============================================

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { fetchStudentTaskGraph } from '../../../lib/studentTaskGraph';

const StudentDataContext = createContext(null);

// How recently the graph must have loaded for a window-focus event to be
// ignored. See the focus effect below.
const REFRESH_THROTTLE_MS = 30_000;

export const StudentDataProvider = ({ children }) => {
  const { userData } = useAuth();
  const uid = userData?.uid;

  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(true);

  // A refresh triggered while one is already in flight would otherwise let
  // the slower response overwrite the newer one — the same out-of-order
  // hazard that put one student's answers under another student's name in
  // the teacher's Check Submissions modal.
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!uid) { setGraph(null); setLoading(false); return; }
    const token = ++requestRef.current;
    setLoading(true);
    const next = await fetchStudentTaskGraph(uid);
    if (token !== requestRef.current) return; // superseded
    setGraph(next);
    setLoading(false);
  }, [uid]);

  useEffect(() => { refresh(); }, [refresh]);

  // Nothing on this dashboard auto-updates — no table is in the
  // supabase_realtime publication — so before this consolidation a student
  // saw a newly distributed task by navigating away from Tasks and back,
  // which refetched. Holding the graph for the life of the shell removes
  // that refetch, so the freshness it bought has to come from somewhere
  // else. Window focus is the better signal anyway: it fires when the
  // student actually returns to the tab, not on every click inside the
  // app, and it is the same trigger the notification bell already uses.
  //
  // Throttled, because focus fires on every alt-tab. Thirty seconds is
  // shorter than the bell's 60s poll, so a task the bell announces is
  // already on screen by the time the student looks.
  const lastLoadRef = useRef(0);
  useEffect(() => {
    if (!loading) lastLoadRef.current = Date.now();
  }, [loading]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastLoadRef.current < REFRESH_THROTTLE_MS) return;
      refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh]);

  return (
    <StudentDataContext.Provider value={{ graph, loading, refresh }}>
      {children}
    </StudentDataContext.Provider>
  );
};

/**
 * @returns {{graph: object|null, loading: boolean, refresh: () => Promise<void>}}
 *   `graph` is null only before the first load resolves. Consumers check
 *   `graph.fatalError` and render their own load-failure state — this hook
 *   never decides that for them, because Overview and Tasks legitimately
 *   disagree about how serious a schedule failure is.
 */
export const useStudentData = () => {
  const ctx = useContext(StudentDataContext);
  if (!ctx) throw new Error('useStudentData must be used inside StudentDataProvider');
  return ctx;
};

export default StudentDataContext;
