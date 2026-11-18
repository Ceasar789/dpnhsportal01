// @vitest-environment jsdom
// T1: ToggleChoice, one choice out of 2 to 4 short options over native radios.
// Arrow keys are the browser's own radio behaviour (jsdom does not move a
// radio group on ArrowRight), so here we pin what that behaviour needs: one
// group, one shared name, real radios with no tabindex or key handler of
// their own. The keys themselves are checked in the browser proof.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import ToggleChoice from './ToggleChoice';

afterEach(cleanup);

const MODES = [
  { value: 'auto', label: 'Auto-check', help: 'Marked for you.' },
  { value: 'manual', label: 'Manual check', help: 'You mark it.' },
];
function Harness({ initial = 'auto', onChange, ...props }) {
  const [value, setValue] = useState(initial);
  return <ToggleChoice legend="Checking" name="t-check" options={MODES} value={value}
    onChange={(v) => { setValue(v); onChange?.(v); }} {...props} />;
}
const radio = name => screen.getByRole('radio', { name });
const track = () => document.querySelector('.fk-tg');
const describedText = el => (el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean)
  .map(id => document.getElementById(id)?.textContent).join(' | ');

describe('ToggleChoice', () => {
  it('is a named group of native radios sharing one name, the value checked, no button pretending to be a radio', () => {
    render(<Harness />);
    const group = screen.getByRole('group', { name: 'Checking' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map(r => [r.tagName, r.type, r.name, r.value])).toEqual([
      ['INPUT', 'radio', 't-check', 'auto'], ['INPUT', 'radio', 't-check', 'manual']]);
    expect(radio('Auto-check').checked).toBe(true);
    expect(radio('Manual check').checked).toBe(false);
    expect(document.querySelector('button')).toBeNull();
    // the browser's own arrow-key and Tab handling is left alone
    for (const r of radios) { expect(r.hasAttribute('tabindex')).toBe(false); expect(r.getAttribute('onkeydown')).toBeNull(); }
  });

  it('choosing an option reports its value and moves the thumb under it', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(track().style.getPropertyValue('--fk-n')).toBe('2');
    expect(track().style.getPropertyValue('--fk-i')).toBe('0');
    fireEvent.click(radio('Manual check'));
    expect(onChange).toHaveBeenCalledWith('manual');
    expect(radio('Manual check').checked).toBe(true);
    expect(track().style.getPropertyValue('--fk-i')).toBe('1');
    expect(document.querySelector('.fk-tg-thumb').getAttribute('aria-hidden')).toBe('true');
  });

  it('disabled: every radio is disabled, the value stays, and the reason is read with each option', () => {
    render(<Harness initial="manual" disabled note={<p>Assignments are checked by you.</p>} />);
    expect(screen.getByRole('group', { name: 'Checking' }).disabled).toBe(true);
    for (const name of ['Auto-check', 'Manual check']) {
      expect(radio(name).disabled).toBe(true);
      expect(describedText(radio(name))).toContain('Assignments are checked by you.');
    }
    expect(radio('Manual check').checked).toBe(true);
  });

  it('only the chosen option help is shown and read; no value hides the thumb and reads no help', () => {
    render(<Harness />);
    expect(describedText(radio('Auto-check'))).toBe('Marked for you.');
    const helps = [...document.querySelectorAll('.fk-tg-helps .fk-help')];
    expect(helps.map(p => p.getAttribute('aria-hidden'))).toEqual([null, 'true']);
    fireEvent.click(radio('Manual check'));
    expect(describedText(radio('Manual check'))).toBe('You mark it.');
    cleanup();
    render(<ToggleChoice legend="Type" name="t-type" options={MODES} value={null} onChange={() => {}} />);
    expect(track().getAttribute('data-empty')).toBe('true');
    expect(radio('Auto-check').getAttribute('aria-describedby')).toBeNull();
  });
});
