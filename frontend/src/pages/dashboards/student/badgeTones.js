// Badge tones for the student screens, built only from the theme variables the
// teacher dashboard uses, so light and dark mode both work. A color is kept
// only where the teacher dashboard uses it for the same meaning:
//   released / present                 -> green  (teacher Grading, Attendance)
//   submitted, awaiting the teacher     -> yellow (teacher "Needs checking")
//   late / absent / important           -> red    (teacher Late tag, Attendance, Announcements)
//   excused                             -> blue   (teacher Attendance)
//   in progress / not started / other   -> neutral (teacher "In progress" / "Not started")
//   type labels                         -> info   (teacher info badges)
export const NEUTRAL = { color: 'var(--text-muted)', bg: 'var(--card2)' };
export const INFO = { color: 'var(--banner-accent)', bg: 'var(--card2)' };
export const GREEN = { color: 'var(--badge-green-fg)', bg: 'var(--badge-green-bg)' };
export const YELLOW = { color: 'var(--badge-yellow-fg)', bg: 'var(--badge-yellow-bg)' };
export const RED = { color: 'var(--badge-red-fg)', bg: 'var(--badge-red-bg)' };
export const BLUE = { color: 'var(--badge-blue-fg)', bg: 'var(--badge-blue-bg)' };

// Countdown badge: only "Late by …" carries a color (late = red, as on the
// teacher side); time left is neutral, since the teacher UI has no urgency colors.
export const countdownTone = tone => (tone === 'late' ? RED : NEUTRAL);
