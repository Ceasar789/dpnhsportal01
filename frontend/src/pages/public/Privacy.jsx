// ============================================
// FILE: src/pages/public/Privacy.jsx
// The Privacy Policy, and LegalPage / LegalDocument, the plain public layout
// it shares with the Terms & Conditions. Q2: the words live in legalContent.js
// (copied from the school's document); this file only lays them out.
// ============================================

import { Link } from 'react-router-dom';
import PublicHeader, { PUBLIC_HEADER_HEIGHT } from '../../components/PublicHeader';
import PublicFooter from '../../components/PublicFooter';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { LEGAL_LAST_UPDATED, PRIVACY, TERMS } from './legalContent';

const SCHOOL_EMAIL = '307915@deped.gov.ph';
const LINK = 'font-semibold underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0062cc]';

export const SchoolEmail = () => (
  <a href={`mailto:${SCHOOL_EMAIL}`} className={`${LINK} break-all`} style={{ color: '#0062cc' }}>
    {SCHOOL_EMAIL}
  </a>
);

export const Section = ({ title, children }) => (
  <section className="mt-8">
    <h2 className="font-work text-xl font-bold" style={{ color: '#1a2b4a' }}>{title}</h2>
    <div className="mt-2">{children}</div>
  </section>
);

// **bold** and [text](/path) inside a content string. The school email, bold
// in the document, becomes its mailto link. Also used by the About page.
const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
export const Rich = ({ text }) => {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    parts.push(text.slice(last, m.index));
    parts.push(m[1] !== undefined
      ? <strong key={m.index}>{m[1] === SCHOOL_EMAIL ? <SchoolEmail /> : m[1]}</strong>
      : <Link key={m.index} to={m[3]} className={LINK} style={{ color: '#0062cc' }}>{m[2]}</Link>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
};

const Block = ({ block, className }) => (typeof block === 'string'
  ? <p className={className}><Rich text={block} /></p>
  : (
    <ul className={`list-disc pl-6 space-y-1 ${className}`}>
      {block.list.map(item => <li key={item}><Rich text={item} /></li>)}
    </ul>
  ));

export const LegalPage = ({ title, related, children }) => {
  // Same breakpoint as the other public pages' header.
  const isMobile = useMediaQuery('(max-width: 1099.98px)');
  return (
    <div className="public-shell min-h-screen flex flex-col" style={{ backgroundColor: '#F8FAFC' }}>
      <PublicHeader isMobile={isMobile} />
      <main className="flex-1" style={{ paddingTop: isMobile ? PUBLIC_HEADER_HEIGHT.mobile : PUBLIC_HEADER_HEIGHT.desktop }}>
        <article className="mx-auto max-w-3xl px-4 py-10 font-public text-base leading-relaxed break-words" style={{ color: '#334155' }}>
          <h1 className="font-work text-3xl font-bold" style={{ color: '#1a2b4a' }}>{title}</h1>
          <p className="mt-2 text-sm" style={{ color: '#64748B' }}>Last updated: {LEGAL_LAST_UPDATED}</p>
          {related && (
            <p className="text-sm">
              <Link to={related.to} className={`${LINK} inline-flex min-h-11 items-center`} style={{ color: '#0062cc' }}>{related.label}</Link>
            </p>
          )}
          {children}
        </article>
      </main>
      <PublicFooter />
    </div>
  );
};

// One legal document from legalContent.js: intro, then numbered sections.
export const LegalDocument = ({ doc, related }) => (
  <LegalPage title={doc.title} related={related}>
    {doc.intro.map(block => <Block key={String(block)} block={block} className="mt-6" />)}
    {doc.sections.map(section => (
      <Section key={section.heading} title={section.heading}>
        {section.blocks.map((block, i) => <Block key={i} block={block} className={i ? 'mt-3' : ''} />)}
      </Section>
    ))}
  </LegalPage>
);

const Privacy = () => <LegalDocument doc={PRIVACY} related={{ to: '/terms', label: TERMS.title }} />;

export default Privacy;
