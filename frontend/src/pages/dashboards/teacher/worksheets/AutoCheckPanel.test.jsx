// @vitest-environment jsdom
// 4f (R45 / R46): the Auto-check explanation, and the per-type choice that stays OFF until its migration.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AutoCheckPanel from './AutoCheckPanel';
import { AUTO_CHECK_TYPES, autoCheckTypesFlagEnabled, normalizeAutoCheckTypes, saveAutoCheckTypes } from './autoCheckTypes';

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe('AutoCheckPanel', () => {
  it('OFF: you review every submission and release the scores', () => {
    render(<AutoCheckPanel on={false} />);
    const note = screen.getByRole('note', { name: 'Auto-check is off' });
    expect(note.textContent).toContain('You check this worksheet manually');
    expect(note.textContent).toContain('Students see their score only after you release it in Grading.');
    expect(note.textContent).not.toMatch(/\bAI\b/);
  });
  it('ON: says it is rule-based with no AI and lists the three types; essays stay manual', () => {
    render(<AutoCheckPanel on onTypesChange={vi.fn()} />);
    const note = screen.getByRole('note', { name: 'Auto-check is on' });
    expect(note.textContent).toContain('Rule-based, no AI');
    for (const label of ['Multiple choice', 'Identification', 'True or false']) expect(note.textContent).toContain(label);
    expect(note.textContent).toContain('Essay, handwriting, drawing and arts are always checked by you.');
    expect(screen.queryByRole('checkbox')).toBeNull(); // flag off: information only
  });
  it('with the flag on, the teacher can untick a type', () => {
    vi.stubEnv('VITE_AUTO_CHECK_TYPES_ENABLED', '1');
    const onTypesChange = vi.fn();
    render(<AutoCheckPanel on types={AUTO_CHECK_TYPES} onTypesChange={onTypesChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Identification' }));
    expect(onTypesChange).toHaveBeenCalledWith(['multiple_choice', 'true_false']);
  });
});

describe('autoCheckTypes', () => {
  it('the flag is off unless it is exactly "1"', () => {
    expect(autoCheckTypesFlagEnabled({})).toBe(false);
    expect(autoCheckTypesFlagEnabled({ VITE_AUTO_CHECK_TYPES_ENABLED: 'true' })).toBe(false);
    expect(autoCheckTypesFlagEnabled({ VITE_AUTO_CHECK_TYPES_ENABLED: '1' })).toBe(true);
  });
  it('flag off: nothing is written to the database', async () => {
    const from = vi.fn();
    expect(await saveAutoCheckTypes({ from }, 'w1', ['multiple_choice'], {})).toBe(true);
    expect(from).not.toHaveBeenCalled();
  });
  it('flag on: writes only known types, in order', async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    expect(await saveAutoCheckTypes({ from }, 'w1', ['true_false', 'essay', 'multiple_choice'], { VITE_AUTO_CHECK_TYPES_ENABLED: '1' })).toBe(true);
    expect(update).toHaveBeenCalledWith({ auto_check_types: ['multiple_choice', 'true_false'] });
    expect(eq).toHaveBeenCalledWith('id', 'w1');
  });
  it('an unknown stored value falls back to all three types', () => {
    expect(normalizeAutoCheckTypes(undefined)).toEqual(AUTO_CHECK_TYPES);
  });
});
