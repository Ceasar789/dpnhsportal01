import { describe, expect, it } from 'vitest';
import { buildManualIlawPdfDefinition } from './manualIlawPdf';
import { createBlankIlawDocument, WEEKDAYS, WEEKLY_FIELDS } from './ilawTemplateModel';

const brand = { depedLogo: 'data:image/png;base64,AAAA', schoolSeal: 'data:image/png;base64,BBBB',
  eduscribeLogo: 'data:image/png;base64,CCCC' };
const tables = definition => definition.content.filter(item => item.table);

describe('structured Manual ILAW PDF definition', () => {
  it('maps every authored field into five bordered source-order tables without editor instructions', () => {
    const document = createBlankIlawDocument({ subject: 'English', grade: 'Grade 7' });
    Object.assign(document.info, {
      nameOfLesson: 'Niño & Learners', teachingDate: '2026-10-17',
      termWeek: 'Term 1, Week 2', designedBy: 'Synthetic Teacher', sessions: '5',
      references: 'Book A\nBook B', aiUseDeclaration: 'No AI used',
    });
    document.learningCompetency = 'Explain a text.';
    for (const [key] of WEEKLY_FIELDS) {
      for (const day of WEEKDAYS) document.weekly[key][day] = `${key}-${day}-unique-content`;
    }
    document.signatures.preparedBy = { name: 'Alex Example', role: 'Teacher' };
    document.signatures.checkedBy = { name: 'Sam Example', role: 'Reviewer' };
    document.signatures.notedBy = { name: 'Pat Example', role: 'Principal' };
    const sourceDetails = { classDuration: '45', teachingStrategy: 'Think-pair-share',
      learningObjectives: 'First goal\nSecond goal' };
    const definition = buildManualIlawPdfDefinition({ document, sourceDetails }, brand);
    // Layout-only break opportunities must not change the authored text.
    const serialized = JSON.stringify(definition).replace(/\u200b/g, '');

    expect(definition.pageSize).toEqual({ width: 936, height: 612 });
    expect(definition.pageMargins).toEqual([36, 36, 36, 36]);
    expect(tables(definition)).toHaveLength(5);
    for (const value of [
      ...Object.values(document.info), document.learningCompetency,
      ...Object.values(sourceDetails),
      ...Object.values(document.weekly).flatMap(row => Object.values(row)),
      ...Object.values(document.signatures).flatMap(signature => Object.values(signature)),
    ]) expect(serialized).toContain(JSON.stringify(value));
    for (const day of WEEKDAYS) expect(serialized.match(new RegExp(`"${day}"`, 'g'))?.length).toBeGreaterThanOrEqual(4);
    expect(serialized).not.toContain('Swipe each table sideways');
    expect(serialized).toContain('data:image/png;base64,AAAA');
    expect(serialized).toContain('data:image/png;base64,BBBB');
    expect(serialized).toContain('data:image/png;base64,CCCC');
  });

  it('leaves absent optional values and signatories blank without adding template officeholders', () => {
    const definition = buildManualIlawPdfDefinition({ document: createBlankIlawDocument() }, brand);
    const serialized = JSON.stringify(definition);
    expect(serialized).not.toContain('REXES MARLON');
    expect(serialized).not.toContain('MARIA BEATRIZ');
    expect(serialized).not.toContain('Lesson-wide details');
  });

  it('rejects incomplete structured content or non-embedded branding before PDF generation', () => {
    expect(() => buildManualIlawPdfDefinition({ document: { info: {} } }, brand)).toThrow();
    expect(() => buildManualIlawPdfDefinition({ document: createBlankIlawDocument() },
      { ...brand, schoolSeal: 'https://example.com/seal.png' })).toThrow('approved school logos');
  });
});
