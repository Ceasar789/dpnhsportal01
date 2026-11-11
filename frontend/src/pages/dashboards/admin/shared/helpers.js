// ============================================
// FILE: src/pages/dashboards/admin/shared/helpers.js
// initials, avatarColor, roleBadge, roleLabel, MONTHS, EVENT_TYPES, TARGET_ROLES
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// ============================================

export const initials = (name = '') =>
  name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U';

export const avatarColor = (str = '') => {
  const colors = ['#3b82f6','#22c55e','#f59e0b','#a78bfa','#ef4444','#2dd4bf','#f472b6','#fb923c'];
  let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
};

// The app has three roles. A role it no longer uses (faculty, registrar) or
// never had still displays: a neutral grey badge and the raw role text.
export const roleBadge = (role) => ({
  student:    'badge-blue',
  teacher:    'badge-green',
  main_admin: 'badge-red',
}[role] || 'badge-grey');

export const roleLabel = (role) => ({
  student:    'Student',
  teacher:    'Teacher',
  main_admin: 'Admin',
}[role] || role);

export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const EVENT_TYPES = ['Event', 'Deadline', 'Holiday', 'Other', 'Custom Type'];

// Target roles for news distribution. Faculty Only, Registrar Only and the
// "Staff Only" set (teacher,faculty,registrar) are no longer offered: with
// those roles gone, staff means teachers, which "Teachers Only" already is.
// Old posts may still carry those values; readers treat them as plain text.
export const TARGET_ROLES = [
  { value: 'all', label: 'All Users' },
  { value: 'student', label: 'Students Only' },
  { value: 'teacher', label: 'Teachers Only' },
  { value: 'custom', label: 'Custom Audience' },
];

