const PREFIX = 'eduscribe:lesson-plan-pdf-filename:v1';

export const lessonPlanFilenamePreferenceKey = (teacherId, planId) => {
  if (teacherId == null || planId == null || String(teacherId) === '' || String(planId) === '') return null;
  return `${PREFIX}:${encodeURIComponent(String(teacherId))}:${encodeURIComponent(String(planId))}`;
};

export const readLessonPlanFilenamePreference = (teacherId, planId) => {
  const key = lessonPlanFilenamePreferenceKey(teacherId, planId);
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return null;
    const value = JSON.parse(raw);
    return typeof value?.filename === 'string' ? value.filename : null;
  } catch {
    return null;
  }
};

export const writeLessonPlanFilenamePreference = (teacherId, planId, filename) => {
  const key = lessonPlanFilenamePreferenceKey(teacherId, planId);
  if (!key || typeof filename !== 'string') return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ filename }));
  } catch {
    // The current editor still works when storage is disabled or full.
  }
};

export const removeLessonPlanFilenamePreference = (teacherId, planId) => {
  const key = lessonPlanFilenamePreferenceKey(teacherId, planId);
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Deleting the lesson plan must not depend on browser storage.
  }
};
