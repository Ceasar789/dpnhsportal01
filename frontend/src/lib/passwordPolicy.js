// ============================================
// FILE: src/lib/passwordPolicy.js
// Shared password strength rule, enforced everywhere a password is set:
// admin user creation, self-service change password, reset password.
// ============================================

export { PASSWORD_HINT, validatePassword } from '../../../shared/passwordPolicy.js';
import { passwordRules } from './formRules';

// U6: the live checklist for that policy (12+ characters, one uppercase letter, one
// number, one special character), passed into PasswordField on Change Password and
// Reset Password. passwordPolicy.test.js proves it never passes a password the
// policy refuses. The submit still runs validatePassword itself.
export const PASSWORD_RULES = Object.freeze(passwordRules({ minLength: 12, uppercase: true, number: true, special: true }));
