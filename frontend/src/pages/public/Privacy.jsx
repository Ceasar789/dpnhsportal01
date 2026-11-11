// ============================================
// FILE: src/pages/public/Privacy.jsx
// The Privacy Statement (a draft for the school to review), and LegalPage,
// the plain public layout it shares with the Terms of Use.
// ============================================

import PublicHeader, { PUBLIC_HEADER_HEIGHT } from '../../components/PublicHeader';
import PublicFooter from '../../components/PublicFooter';
import { useMediaQuery } from '../../lib/useMediaQuery';

const SCHOOL_EMAIL = '307915@deped.gov.ph';

export const SchoolEmail = () => (
  <a href={`mailto:${SCHOOL_EMAIL}`} className="font-semibold underline break-all rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0062cc]" style={{ color: '#0062cc' }}>
    {SCHOOL_EMAIL}
  </a>
);

export const Section = ({ title, children }) => (
  <section className="mt-8">
    <h2 className="font-work text-xl font-bold" style={{ color: '#1a2b4a' }}>{title}</h2>
    <div className="mt-2">{children}</div>
  </section>
);

export const LegalPage = ({ title, children }) => {
  // Same breakpoint as the other public pages' header.
  const isMobile = useMediaQuery('(max-width: 1099.98px)');
  return (
    <div className="public-shell min-h-screen flex flex-col" style={{ backgroundColor: '#F8FAFC' }}>
      <PublicHeader isMobile={isMobile} />
      <main className="flex-1" style={{ paddingTop: isMobile ? PUBLIC_HEADER_HEIGHT.mobile : PUBLIC_HEADER_HEIGHT.desktop }}>
        <article className="mx-auto max-w-3xl px-4 py-10 font-public text-base leading-relaxed break-words" style={{ color: '#334155' }}>
          <h1 className="font-work text-3xl font-bold" style={{ color: '#1a2b4a' }}>{title}</h1>
          <p className="mt-2 text-sm" style={{ color: '#64748B' }}>Last updated: November 11, 2026</p>
          {children}
        </article>
      </main>
      <PublicFooter />
    </div>
  );
};

const Privacy = () => (
  <LegalPage title="Privacy Statement">
    <p className="mt-6">
      This statement explains what personal information the Dela Paz National High School student portal collects, why,
      and who can see it. It is written with the Data Privacy Act of 2012 (Republic Act No. 10173) in mind.
    </p>
    <Section title="What we collect">
      <p>
        Your name, school email, and the role and department set by the school. Optionally, the phone number, date of
        birth, address, short bio and profile photo you add yourself. For students: LRN, student number, section,
        attendance, task answers and released results. For teachers: lesson plans and the files you upload.
      </p>
    </Section>
    <Section title="Why we use it">
      <p>To run classes: post and check tasks, record attendance, release results and send school notices.</p>
    </Section>
    <Section title="Who can see it">
      <p>
        Students see only their own records. Teachers see the students in the sections they teach or advise and their
        work for the teacher&apos;s own tasks; teachers and administrators can also see the school directory, including
        contact details. School administrators can see all records.
      </p>
    </Section>
    <Section title="AI features">
      <p>
        When a teacher uses AI to draft a lesson plan or worksheet, lesson content the teacher provides (such as the
        topic, subject, grade and uploaded lesson file) is sent to Google Gemini or Groq to generate a draft, which the
        teacher reviews. We do not send student names, answers or scores to these services.
      </p>
    </Section>
    <Section title="Cookies and storage">
      <p>
        We use no tracking or advertising. Your browser keeps your sign-in session, your theme choice and a count of
        failed sign-in attempts so the portal can protect accounts.
      </p>
    </Section>
    <Section title="How long we keep records">
      <p>Accounts are archived rather than permanently deleted. Backups are kept for a short period.</p>
    </Section>
    <Section title="Your rights and how to contact us">
      <p>
        You can correct your own profile details in Profile. For anything else, such as your LRN or role, or to ask
        about your information or its removal, contact the school at <SchoolEmail />.
      </p>
    </Section>
    <p className="mt-10 text-sm" style={{ color: '#64748B' }}>
      This statement may be updated; the date above shows the latest version.
    </p>
  </LegalPage>
);

export default Privacy;
