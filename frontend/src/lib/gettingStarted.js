// V2a: where the Getting started card keeps its state: this browser only
// (localStorage, per role and user), every access guarded; nothing goes to
// the database. Blocked or broken storage reads as a fresh card.
export const gettingStartedKey = (role, uid) => `smartedu-getting-started-${role}-${uid || 'anon'}`;

export const readGettingStarted = (key) => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || 'null');
    return saved && typeof saved === 'object'
      ? { hidden: saved.hidden === true, done: Array.isArray(saved.done) ? saved.done : [] }
      : { hidden: false, done: [] };
  } catch {
    return { hidden: false, done: [] };
  }
};

export const writeGettingStarted = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked: nothing to keep */ }
};
