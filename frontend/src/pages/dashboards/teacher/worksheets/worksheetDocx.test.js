// @vitest-environment jsdom
// R22 + R49 (4k): Student copy has no answers; Key to correction has every saved key. Lesson plans export their own text.
import { describe, expect, it } from 'vitest';
import { worksheetDocxBlocks } from './worksheetDocx';
import { blocksFromHtml, lessonPlanDocxBlocks } from '../lessonPlans/lessonPlanDocx';

const ws = { title: 'Cells Quiz', subject: 'Science', grade_level: 'Grade 7', instructions: 'Answer all items.' };
const items = [
  { id: 'i2', position: 2, question: 'The cell is the basic unit of life.', item_type: 'true_false', options: [], points: 1 },
  { id: 'i1', position: 1, question: 'Which organelle makes energy?', item_type: 'multiple_choice', options: ['Nucleus', 'Mitochondria'], points: 2 },
  { id: 'i3', position: 3, question: 'Explain osmosis.', item_type: 'essay', options: [], points: 5 },
];
const keys = { i1: { correct_answer: 'Mitochondria' }, i2: { correct_answer: ['True'] } };
const all = blocks => blocks.map(b => b.text || '').join('\n');

describe('worksheetDocxBlocks', () => {
  it('Student copy: questions in order with options, a name line, and no answers', () => {
    const text = all(worksheetDocxBlocks(ws, items, keys));
    expect(text.indexOf('1. Which organelle makes energy? (2 points)')).toBeLessThan(text.indexOf('2. The cell is the basic unit'));
    expect(text).toContain('   B. Mitochondria');
    expect(text).toContain('Name: ');
    expect(text).not.toContain('Answer:');
    expect(text).not.toMatch(/Key to correction/);
  });
  it('Key to correction: every saved answer, essays left to the teacher', () => {
    const text = all(worksheetDocxBlocks(ws, items, keys, { withKey: true }));
    expect(text).toContain('Key to correction (teacher copy)');
    expect(text).toContain('Answer: Mitochondria');
    expect(text).toContain('Answer: True');
    expect(text).toContain('Answer: Checked by the teacher');
  });
});

describe('lesson plan blocks', () => {
  it('AI HTML becomes headings, paragraphs and tables, with no markup kept', () => {
    const blocks = blocksFromHtml('<h2>Objectives</h2><p>Describe <b>matter</b>.</p><table><tr><th>Day</th><td>Mon</td></tr></table><script>x()</script>');
    expect(blocks).toEqual([{ heading: 2, text: 'Objectives' }, { text: 'Describe matter.' }, { table: [['Day', 'Mon']] }]);
  });
  it('an AI plan starts with its title and subject line', () => {
    const blocks = lessonPlanDocxBlocks({ title: 'Matter', subject: 'Science', grade_level: 'Grade 7', ai_generated: true, objectives: '<p>Body</p>' });
    expect(blocks.slice(0, 3)).toEqual([{ heading: 1, text: 'Matter' }, { text: 'Science · Grade 7' }, { text: 'Body' }]);
  });
});
