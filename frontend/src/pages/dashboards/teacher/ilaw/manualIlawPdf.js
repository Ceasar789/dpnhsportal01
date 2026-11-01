import { normalizeManualIlawDocument } from './fullManualIlawModel';
import { WEEKDAYS } from './ilawTemplateModel';
import { ILAW_SCHOOL_LETTERHEAD, ILAW_SECTION_INTROS } from './ilawDocumentContent';

const LABEL_FILL = '#edf2f7';
const BORDER = '#515b68';
// pdfmake does not reliably wrap a long uninterrupted word in narrow weekday cells.
// Zero-width break opportunities change presentation only; the structured draft is untouched.
const printable = value => String(value || ' ').replace(/\S{35,}/gu, word =>
  Array.from(word).reduce((parts, character, index) => parts + (index && index % 28 === 0 ? '\u200b' : '') + character, ''));
const body = value => ({ text: printable(value), fontSize: 8.5, margin: [2, 1, 2, 1] });
const label = value => ({ ...body(value), bold: true, fillColor: LABEL_FILL });
const empty = () => ({ text: '' });
const wide = (name, value) => [label(name), { ...body(value), colSpan: 3 }, empty(), empty()];
const weekdayRow = (name, values) => [label(name), ...WEEKDAYS.map(day => body(values[day]))];
const layout = {
  hLineWidth: () => 0.6,
  vLineWidth: () => 0.6,
  hLineColor: () => BORDER,
  vLineColor: () => BORDER,
  paddingLeft: () => 2,
  paddingRight: () => 2,
  paddingTop: () => 1.5,
  paddingBottom: () => 1.5,
};

function section(title, introduction, entries) {
  return {
    layout,
    margin: [0, 0, 0, 9],
    table: {
      headerRows: 2,
      widths: [148, ...WEEKDAYS.map(() => '*')],
      body: [
        [label(title), { ...body(introduction), italics: true, colSpan: 5 }, empty(), empty(), empty(), empty()],
        [label(''), ...WEEKDAYS.map(day => label(day))],
        ...entries,
      ],
    },
  };
}

function normalizedDetails(sourceDetails) {
  if (sourceDetails == null) return null;
  if (['classDuration', 'teachingStrategy', 'learningObjectives'].some(key => typeof sourceDetails[key] !== 'string')) {
    throw new Error('The Manual ILAW lesson-wide details are incomplete.');
  }
  return sourceDetails;
}

// The browser editor and this export receive the same structured document. No HTML is parsed.
export function buildManualIlawPdfDefinition(input, brandImages) {
  const document = normalizeManualIlawDocument(input?.document);
  const details = normalizedDetails(input?.sourceDetails);
  if (!['depedLogo', 'schoolSeal', 'eduscribeLogo'].every(key =>
    /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(brandImages?.[key] ?? ''))) {
    throw new Error('The approved school logos could not be embedded in the PDF.');
  }

  const info = document.info;
  const weekly = document.weekly;
  const information = {
    layout,
    margin: [0, 0, 0, 9],
    table: {
      widths: [172, '*', 172, '*'],
      body: [
        [label('Name of Lesson'), body(info.nameOfLesson), label('Teaching Date'), body(info.teachingDate)],
        [label('Learning Area/s'), body(info.learningArea), label('Term No. and Week No.'), body(info.termWeek)],
        wide('Designed by Teacher/s', info.designedBy),
        wide('Designed for which Grade Level and Section', info.gradeSection),
        wide('No. of Sessions', info.sessions),
        wide('References (books, websites, toolkits, etc.)', info.references),
        wide('Declaration of AI Use', info.aiUseDeclaration),
      ],
    },
  };

  const content = [
    {
      columns: [
        { image: brandImages.depedLogo, fit: [56, 56], width: 60 },
        { stack: ILAW_SCHOOL_LETTERHEAD.map((line, index) => ({
          text: printable(line), alignment: 'center', bold: index === 4, fontSize: index === 4 ? 9 : 8,
        })), width: '*' },
        { columns: [
          { image: brandImages.schoolSeal, fit: [42, 51], width: 43 },
          { image: brandImages.eduscribeLogo, fit: [42, 51], width: 43 },
        ], width: 86 },
      ], margin: [0, 0, 0, 8], unbreakable: true,
    },
    { text: printable(`ILAW LESSON PLAN${info.learningArea ? ` IN ${info.learningArea}` : ''}`), bold: true,
      fontSize: 12, alignment: 'center', margin: [0, 0, 0, 9] },
    information,
  ];

  if (details) {
    content.push({
      stack: [
        { text: 'Lesson-wide details', bold: true, fontSize: 9 },
        { text: [{ text: 'Class Duration (minutes per session): ', bold: true }, printable(details.classDuration)] },
        { text: [{ text: 'Teaching Strategy: ', bold: true }, printable(details.teachingStrategy)] },
        { text: [{ text: 'Learning Objectives (lesson-wide): ', bold: true }, printable(details.learningObjectives)] },
      ], margin: [0, 0, 0, 9], fontSize: 8.5,
    });
  }

  content.push(
    section('I — INTENTIONS', ILAW_SECTION_INTROS.intentions, [
      [label('Learning Competency'), { ...body(document.learningCompetency), colSpan: 5 }, empty(), empty(), empty(), empty()],
      weekdayRow('Learning Objectives', weekly.learningObjectives),
      weekdayRow('Learner Context', weekly.learnerContext),
    ]),
    section('L — LEARNING EXPERIENCE', ILAW_SECTION_INTROS.experience, [
      weekdayRow('Pre-Lesson', weekly.preLesson),
      weekdayRow('Flow', weekly.flow),
      weekdayRow('Learning Resources', weekly.learningResources),
      weekdayRow('Opportunities for Integration', weekly.integration),
    ]),
    section('A — ASSESSMENT', ILAW_SECTION_INTROS.assessment, [
      weekdayRow('Formative Assessment', weekly.formativeAssessment),
    ]),
    section('W — WAYS FORWARD', ILAW_SECTION_INTROS.waysForward, [
      weekdayRow('Extended Learning Opportunities', weekly.extendedLearning),
      weekdayRow('Reflections', weekly.reflections),
    ]),
    {
      columns: [
        { stack: [
          { text: 'Prepared by', bold: true },
          { text: printable(document.signatures.preparedBy.name) },
          { text: printable(document.signatures.preparedBy.role) },
          { text: 'Noted by', bold: true, margin: [0, 9, 0, 0] },
          { text: printable(document.signatures.notedBy.name) },
          { text: printable(document.signatures.notedBy.role) },
        ], width: '*' },
        { stack: [
          { text: 'Checked by', bold: true },
          { text: printable(document.signatures.checkedBy.name) },
          { text: printable(document.signatures.checkedBy.role) },
        ], width: '*' },
      ], fontSize: 9, margin: [0, 5, 0, 0],
    },
  );

  return {
    pageSize: { width: 936, height: 612 }, // Source DOCX: 13 × 8.5 inches, landscape.
    pageMargins: [36, 36, 36, 36], // Source DOCX: 0.5-inch margins.
    content,
    defaultStyle: { font: 'Roboto', fontSize: 8.5, color: '#111827' },
  };
}
