import { describe, expect, it } from 'vitest';
import { parseActivityText } from './activityTextBlocks';

const shape = blocks => blocks.map(block => (block.type === 'heading' ? `heading ${block.text}`
  : block.type === 'fields' ? `fields ${block.rows.map(row => row[0]).join(',')}`
    : block.type === 'p' ? 'p' : `${block.type}(${block.items.length})`));

const SAMPLE = `Objective: Define and identify different types of conflict (character vs. character, society, nature/environment, self) within a literary text.
Grouping: Individual
Duration: 45 minutes
Materials:
-Excerpts from "Biag ni Lam-ang"
-Whiteboard or projector
Procedure:
1. Listen as your teacher introduces "Biag ni Lam-ang."
2. Pay attention as your teacher defines conflict in literature.
Success criteria:
-Learners can define conflict in literature.`;

// What renderActivityInstructions writes: "- item" bullets and "1. step" numbers.
const FULL = ['Objective: Identify conflict.', 'Grouping: Individual', 'Duration: 45 minutes', 'Materials:',
  '- Excerpts', '- Whiteboard', '- Worksheet', 'Procedure:', '1. One', '2. Two', '3. Three', '4. Four', '5. Five', '6. Six',
  'Success criteria:', '- Defines', '- Identifies', '- Explains'].join('\n');

describe('parseActivityText', () => {
  it('parses the pasted sample Activity, keeping the full values', () => {
    const blocks = parseActivityText(SAMPLE);
    expect(shape(blocks)).toEqual(['fields Objective,Grouping,Duration', 'heading Materials', 'ul(2)',
      'heading Procedure', 'ol(2)', 'heading Success criteria', 'ul(1)']);
    expect(blocks[0].rows[0][1]).toContain('(character vs. character, society, nature/environment, self)');
    expect(blocks[0].rows[2]).toEqual(['Duration', '45 minutes']);
    expect(blocks[2].items[0]).toBe('Excerpts from "Biag ni Lam-ang"');
    expect(blocks[4].items[0]).toBe('Listen as your teacher introduces "Biag ni Lam-ang."');
  });

  it('parses a full-length Activity in the backend format', () => {
    expect(shape(parseActivityText(FULL))).toEqual(['fields Objective,Grouping,Duration', 'heading Materials', 'ul(3)',
      'heading Procedure', 'ol(6)', 'heading Success criteria', 'ul(3)']);
  });

  it('handles Windows line endings, spaced and unspaced bullets, and other markers', () => {
    expect(parseActivityText('-one\r\n- two\r\n• three\r\n– four')).toEqual([{ type: 'ul', items: ['one', 'two', 'three', 'four'] }]);
    expect(parseActivityText('1) one\n2.two')).toEqual([{ type: 'ol', items: ['one', 'two'] }]);
  });

  it('parses Filipino labels with no word list', () => {
    const blocks = parseActivityText(['Layunin: Tukuyin ang tunggalian.', 'Pagpapangkat: Dalawahan', 'Tagal: 45 minuto',
      'Mga Kagamitan:', '- Papel', 'Pamamaraan:', '1. Makinig.', 'Pamantayan sa Tagumpay:', '- Natutukoy'].join('\n'));
    expect(shape(blocks)).toEqual(['fields Layunin,Pagpapangkat,Tagal', 'heading Mga Kagamitan', 'ul(1)',
      'heading Pamamaraan', 'ol(1)', 'heading Pamantayan sa Tagumpay', 'ul(1)']);
  });

  it('keeps a plain paragraph as one paragraph', () => {
    expect(parseActivityText('Read the story and share it with a partner.'))
      .toEqual([{ type: 'p', text: 'Read the story and share it with a partner.' }]);
  });

  it('a blank line, heading or paragraph ends a list', () => {
    expect(shape(parseActivityText('- a\n\n- b'))).toEqual(['ul(1)', 'ul(1)']);
    expect(shape(parseActivityText('- a\nNext:\n- b'))).toEqual(['ul(1)', 'heading Next', 'ul(1)']);
    expect(shape(parseActivityText('- a\nplain words\n- b'))).toEqual(['ul(1)', 'p', 'ul(1)']);
    expect(shape(parseActivityText('- a\n1. b'))).toEqual(['ul(1)', 'ol(1)']);
  });

  it('a label line straight after a list stays a paragraph, and starts fields after a break', () => {
    expect(parseActivityText('- a\nNote: keep it')[1]).toEqual({ type: 'p', text: 'Note: keep it' });
    expect(shape(parseActivityText('- a\n\nNote: keep it'))).toEqual(['ul(1)', 'fields Note']);
  });

  it('respects the label limits', () => {
    expect(parseActivityText(`${'x'.repeat(41)}:`)[0].type).toBe('p');
    expect(parseActivityText(`${'x'.repeat(41)}: value`)[0].type).toBe('p');
    expect(parseActivityText('Dr. Cruz says: read')[0].type).toBe('p');
    expect(parseActivityText('Time: 8:30 to 9:00')[0]).toEqual({ type: 'fields', rows: [['Time', '8:30 to 9:00']] });
  });

  it('returns nothing for empty or non-string input', () => {
    for (const value of ['', '  \n \r\n ', null, undefined, 5, {}, []]) expect(parseActivityText(value)).toEqual([]);
    expect(parseActivityText()).toEqual([]);
  });

  it('keeps markup as literal text', () => {
    const attack = '<script>alert(1)</script>';
    expect(parseActivityText(attack)).toEqual([{ type: 'p', text: attack }]);
    expect(parseActivityText(`- ${attack}`)[0].items).toEqual([attack]);
  });
});
