// ============================================
// FILE: src/lib/passwordPolicy.js
// Shared password strength rule, enforced everywhere a password is set:
// admin user creation, self-service change password, reset password.
// ============================================

export { PASSWORD_HINT, validatePassword } from '../../../shared/passwordPolicy.js';
