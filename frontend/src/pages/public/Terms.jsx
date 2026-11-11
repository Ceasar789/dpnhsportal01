// ============================================
// FILE: src/pages/public/Terms.jsx
// The Terms of Use (a draft for the school to review).
// ============================================

import { LegalPage, SchoolEmail, Section } from './Privacy';

const Terms = () => (
  <LegalPage title="Terms of Use">
    <p className="mt-6">
      These terms apply to everyone who uses the Dela Paz National High School student portal.
    </p>
    <Section title="1. Who may use the portal">
      <p>Students, teachers and administrators of the school with an account created by the school.</p>
    </Section>
    <Section title="2. Your account">
      <p>
        Keep your password private and do not share it. You are responsible for activity under your account. Tell the
        school if you think someone else is using it.
      </p>
    </Section>
    <Section title="3. Acceptable use">
      <p>
        Use the portal for school purposes only. Do not try to see other people&apos;s records, bypass security, upload
        harmful or offensive content, or harass others. Do your own work unless your teacher allows otherwise.
      </p>
    </Section>
    <Section title="4. Schoolwork and results">
      <p>
        Results shown in the portal are released by your teacher for your information and are not official grades.
        Official records are kept by the school.
      </p>
    </Section>
    <Section title="5. Content you add">
      <p>Teachers are responsible for the materials they upload and confirm they have the right to share them.</p>
    </Section>
    <Section title="6. The school's rights">
      <p>
        The school may suspend or archive an account for misuse, or when a student leaves, and may correct records.
      </p>
    </Section>
    <Section title="7. Availability">
      <p>
        The portal may be unavailable at times for maintenance. It is provided as is, without a guarantee of
        uninterrupted service.
      </p>
    </Section>
    <Section title="8. Changes">
      <p>These terms may be updated; the date above shows the latest version.</p>
    </Section>
    <Section title="9. Contact">
      <p><SchoolEmail /></p>
    </Section>
  </LegalPage>
);

export default Terms;
