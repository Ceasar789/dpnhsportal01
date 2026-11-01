// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import IlawTemplate from './IlawTemplate';
import { createBlankIlawDocument, WEEKDAYS } from './ilawTemplateModel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function EditableTemplate({ initial = createBlankIlawDocument() }) {
  const [document, setDocument] = useState(initial);
  return <IlawTemplate value={document} onChange={setDocument} />;
}

describe('school ILAW template foundation', () => {
  it('renders every school-document section in source order with a blank draft', () => {
    const { container } = render(<EditableTemplate />);
    const document = container.querySelector('.ilaw-template');
    const sections = ['Name of Lesson', 'I — INTENTIONS', 'L — LEARNING EXPERIENCE', 'A — ASSESSMENT', 'W — WAYS FORWARD', 'Prepared by', 'Checked by', 'Noted by'];
    let last = -1;
    for (const section of sections) {
      const next = document.textContent.indexOf(section);
      expect(next, section).toBeGreaterThan(last);
      last = next;
    }
    expect(screen.getByRole('textbox', { name: 'Declaration of AI Use' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Learning Competency' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Formative Assessment, Friday' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Dela Paz National High School seal' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Department of Education logo' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'EduScribe logo' })).toBeTruthy();
    expect(container.querySelector('.ilaw-template-letterhead').firstElementChild.alt).toBe('Department of Education logo');
    expect(container.querySelectorAll('.ilaw-template-hybrid-mark img')).toHaveLength(2);
  });

  it('preserves the five Word tables, information merges, and weekday objective merge', () => {
    const { container } = render(<EditableTemplate />);
    const tables = container.querySelectorAll('table');
    expect(tables).toHaveLength(5);
    expect(tables[0].rows).toHaveLength(7);
    expect(tables[0].rows[2].cells[1].colSpan).toBe(3);
    expect(tables[0].rows[6].cells[1].colSpan).toBe(3);
    expect(tables[1].rows[0].cells[1].colSpan).toBe(5);
    expect(tables[1].rows[1].cells[1].colSpan).toBe(5);
    expect(tables[1].rows[2].cells[0].rowSpan).toBe(2);
    WEEKDAYS.forEach((day, index) => expect(tables[1].rows[2].cells[index + 1].textContent).toBe(day));
    for (const table of [...tables].slice(1)) {
      expect(table.rows[0].cells[1].colSpan).toBe(5);
      expect(table.rows[table.rows.length - 1].cells).toHaveLength(6);
    }
  });

  it('edits one cell without erasing the rest of the controlled document', () => {
    render(<EditableTemplate />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name of Lesson' }), { target: { value: 'Fractions' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Learning Objectives, Monday' }), { target: { value: 'Identify fractions' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Learning Objectives, Friday' }), { target: { value: 'Review fractions' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Declaration of AI Use' }), { target: { value: 'No AI used.' } });
    expect(screen.getByRole('textbox', { name: 'Name of Lesson' }).value).toBe('Fractions');
    expect(screen.getByRole('textbox', { name: 'Learning Objectives, Monday' }).value).toBe('Identify fractions');
    expect(screen.getByRole('textbox', { name: 'Learning Objectives, Friday' }).value).toBe('Review fractions');
    expect(screen.getByRole('textbox', { name: 'Declaration of AI Use' }).value).toBe('No AI used.');
    expect(screen.getByRole('textbox', { name: 'Learner Context, Wednesday' }).value).toBe('');
  });

  it('uses assigned subject and grade values without TLE or signatory defaults', () => {
    const first = createBlankIlawDocument({ subject: 'Mathematics', grade: 'Grade 8' });
    const second = createBlankIlawDocument();
    first.weekly.flow.Monday = 'A separate draft';
    expect(second.weekly.flow.Monday).toBe('');
    const { container } = render(<EditableTemplate initial={first} />);
    expect(screen.getByRole('textbox', { name: 'Learning Area/s' }).value).toBe('Mathematics');
    expect(screen.getByRole('textbox', { name: 'Designed for which Grade Level and Section' }).value).toBe('Grade 8');
    expect(container.querySelector('.ilaw-template-title').textContent).toBe('ILAW LESSON PLAN IN Mathematics');
    expect(screen.getByRole('textbox', { name: 'Prepared by name' }).value).toBe('');
    expect(screen.getByRole('textbox', { name: 'Checked by name' }).value).toBe('');
    expect(screen.getByRole('textbox', { name: 'Noted by name' }).value).toBe('');
    expect(container.textContent).not.toContain('TLE 9');
  });

  it('renders a read-only preview from the same data without changing its content', () => {
    const document = createBlankIlawDocument({ subject: 'Science', grade: 'Grade 7' });
    document.info.nameOfLesson = 'Cells';
    document.weekly.formativeAssessment.Tuesday = 'Short quiz';
    document.signatures.preparedBy.name = 'Synthetic Teacher';
    const before = JSON.stringify(document);
    const { container } = render(<IlawTemplate value={document} editable={false} />);
    expect(container.textContent).toContain('Cells');
    expect(container.textContent).toContain('Short quiz');
    expect(container.textContent).toContain('Synthetic Teacher');
    expect(container.querySelectorAll('input, textarea')).toHaveLength(0);
    expect(JSON.stringify(document)).toBe(before);
  });

  it('has keyboard-reachable labels and no Save, Post, distribution, or network side effect', () => {
    const fetch = vi.fn(() => { throw new Error('Unexpected network request'); });
    vi.stubGlobal('fetch', fetch);
    render(<EditableTemplate />);
    const field = screen.getByRole('textbox', { name: 'Pre-Lesson, Monday' });
    field.focus();
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: 'Review previous lesson' } });
    expect(screen.getByRole('textbox', { name: 'Pre-Lesson, Monday' }).value).toBe('Review previous lesson');
    expect(screen.queryByRole('button', { name: /save|post|distribute/i })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
