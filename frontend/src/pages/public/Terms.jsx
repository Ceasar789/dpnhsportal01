// ============================================
// FILE: src/pages/public/Terms.jsx
// The Terms & Conditions. Q2: the words live in legalContent.js.
// ============================================

import { LegalDocument } from './Privacy';
import { PRIVACY, TERMS } from './legalContent';

const Terms = () => <LegalDocument doc={TERMS} related={{ to: '/privacy', label: PRIVACY.title }} />;

export default Terms;
