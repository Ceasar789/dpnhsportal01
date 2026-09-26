// ============================================
// FILE: src/lib/passwordPolicy.js
// Shared password strength rule, enforced everywhere a password is set:
// admin user creation, self-service change password, reset password.
// ============================================

export const PASSWORD_HINT = 'Min 12 characters, with at least 1 uppercase letter, 1 number, and 1 special character';

export function validatePassword(password) {
  if (!password || password.length < 12) return 'Password must be at least 12 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character';
  return null;
}
