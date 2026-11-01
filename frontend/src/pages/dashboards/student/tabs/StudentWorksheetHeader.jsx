import React from 'react';
import depedLogo from '../../teacher/ilaw/assets/deped-logo.png';
import schoolSeal from '../../teacher/ilaw/assets/school-seal.png';
import eduscribeLogo from '../../teacher/ilaw/assets/eduscribe-logo.png';

const LETTERHEAD = [
  'Republic of the Philippines',
  'Department of Education',
  'Region IVA-CALABARZON',
  'City Schools Division of Biñan City',
  'DELA PAZ NATIONAL HIGH SCHOOL',
  'P. Paterno St., Dela Paz, Biñan City, Laguna',
];
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const label = value => typeof value === 'string' && value.trim() && !UUID.test(value.trim())
  ? value.trim() : null;

export default function StudentWorksheetHeader({ title, subject, grade, section, schoolYear,
  studentName, instructions, items, releasedScore }) {
  const totalPoints = Math.round((items || []).reduce((sum, item) => {
    const points = Number(item.points);
    return sum + (Number.isFinite(points) ? points : 0);
  }, 0) * 100) / 100;
  const gradeAndSection = [label(grade), label(section)].filter(Boolean).join(' - ');
  const date = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila',
    month: 'short', day: 'numeric', year: 'numeric' }).format(new Date());

  return <div style={{ color: '#1f1f1f' }}>
    <header className="ilaw-template-letterhead flex flex-wrap items-center justify-between gap-3 border-b pb-4 text-center"
      style={{ borderColor: '#b7a999' }}>
      <img className="ilaw-template-deped h-12 w-12 object-contain" src={depedLogo}
        alt="Department of Education logo" />
      <div className="ilaw-template-letterhead-text flex-1 min-w-[180px] text-xs leading-snug">
        {LETTERHEAD.map((line, index) => <p key={line}
          className={index === 4 ? 'ilaw-template-school font-bold' : undefined}>{line}</p>)}
      </div>
      <div className="ilaw-template-hybrid-mark flex items-center gap-2" aria-label="School and EduScribe branding">
        <img className="h-12 w-12 object-contain" src={schoolSeal} alt="Dela Paz National High School seal" />
        <img className="h-12 w-12 object-contain" src={eduscribeLogo} alt="EduScribe logo" />
      </div>
    </header>
    <h1 className="mt-5 text-center text-lg font-bold tracking-wide">WORKSHEET</h1>
    {label(title) && <p className="mt-1 text-center font-semibold">{label(title)}</p>}
    <div className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {label(studentName) && <p><strong>Name:</strong> <span className="inline-block min-w-32 border-b px-1"
        style={{ borderColor: '#6b6258' }}>{label(studentName)}</span></p>}
      {gradeAndSection && <p><strong>Grade and section:</strong> <span className="inline-block min-w-32 border-b px-1"
        style={{ borderColor: '#6b6258' }}>{gradeAndSection}</span></p>}
      <p><strong>Score:</strong> {releasedScore
        ? <span>{releasedScore.score}</span>
        : <span className="inline-block min-w-12 border-b"
            style={{ borderColor: '#6b6258' }} aria-label="blank score">&nbsp;</span>} / {releasedScore ? releasedScore.total : totalPoints}</p>
      <p><strong>Date:</strong> <span className="inline-block min-w-28 border-b px-1"
        style={{ borderColor: '#6b6258' }}>{date}</span></p>
      {label(subject) && <p><strong>Subject:</strong> <span className="inline-block min-w-28 border-b px-1"
        style={{ borderColor: '#6b6258' }}>{label(subject)}</span></p>}
      {label(schoolYear) && <p><strong>School year:</strong> <span className="inline-block min-w-28 border-b px-1"
        style={{ borderColor: '#6b6258' }}>{label(schoolYear)}</span></p>}
    </div>
    {label(instructions) && <div className="mt-6 rounded border px-4 py-3 text-sm whitespace-pre-wrap"
      style={{ borderColor: '#b7a999', backgroundColor: '#fffaf0' }}>
      <strong>Directions:</strong> {label(instructions)}
    </div>}
  </div>;
}
