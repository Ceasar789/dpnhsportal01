// @vitest-environment jsdom
// U2 form kit: SegmentedChoice radio-group semantics and keyboard.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import SegmentedChoice from './SegmentedChoice';

afterEach(cleanup);

const ROLES = [{ value: 'student', label: 'Student' }, { value: 'teacher', label: 'Teacher' }, { value: 'main_admin', label: 'Admin' }];

function Harness({ initial = 'student', options = ROLES, ...rest }) {
  const [v, setV] = useState(initial);
  return <SegmentedChoice legend="Role" options={options} value={v} onChange={setV} {...rest} />;
}

const radio = name => screen.getByRole('radio', { name });
const checked = () => screen.getAllByRole('radio').filter(r => r.getAttribute('aria-checked') === 'true').map(r => r.textContent);
const tabStops = () => screen.getAllByRole('radio').filter(r => r.tabIndex === 0).map(r => r.textContent);

describe('SegmentedChoice', () => {
  it('a radiogroup named by its legend, with one checked radio and one tab stop', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Role' })).toBeTruthy();
    expect(checked()).toEqual(['Student']);
    expect(tabStops()).toEqual(['Student']);
    expect(radio('Student').getAttribute('type')).toBe('button');
  });

  it('click selects', () => {
    render(<Harness />);
    fireEvent.click(radio('Teacher'));
    expect(checked()).toEqual(['Teacher']);
    expect(tabStops()).toEqual(['Teacher']);
  });

  it('arrow keys move focus AND select, and wrap at both ends', () => {
    render(<Harness />);
    radio('Student').focus();
    fireEvent.keyDown(radio('Student'), { key: 'ArrowRight' });
    expect(checked()).toEqual(['Teacher']);
    expect(document.activeElement).toBe(radio('Teacher'));
    fireEvent.keyDown(radio('Teacher'), { key: 'ArrowDown' });
    expect(checked()).toEqual(['Admin']);
    fireEvent.keyDown(radio('Admin'), { key: 'ArrowRight' });
    expect(checked()).toEqual(['Student']);
    fireEvent.keyDown(radio('Student'), { key: 'ArrowLeft' });
    expect(checked()).toEqual(['Admin']);
    expect(document.activeElement).toBe(radio('Admin'));
    fireEvent.keyDown(radio('Admin'), { key: 'ArrowUp' });
    expect(checked()).toEqual(['Teacher']);
  });

  it('Home and End jump; Space and Enter select the focused option; other keys do nothing', () => {
    const onChange = vi.fn();
    render(<SegmentedChoice legend="Role" options={ROLES} value="teacher" onChange={onChange} />);
    fireEvent.keyDown(radio('Teacher'), { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('main_admin');
    fireEvent.keyDown(radio('Teacher'), { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('student');
    onChange.mockClear();
    fireEvent.keyDown(radio('Admin'), { key: ' ' });
    expect(onChange).toHaveBeenLastCalledWith('main_admin');
    fireEvent.keyDown(radio('Admin'), { key: 'a' });
    fireEvent.keyDown(radio('Teacher'), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('disabled options are skipped by arrows and clicks', () => {
    const options = [ROLES[0], { ...ROLES[1], disabled: true }, ROLES[2]];
    render(<Harness options={options} />);
    fireEvent.keyDown(radio('Student'), { key: 'ArrowRight' });
    expect(checked()).toEqual(['Admin']);
    fireEvent.click(radio('Teacher'));
    expect(checked()).toEqual(['Admin']);
    expect(radio('Teacher').getAttribute('aria-disabled')).toBe('true');
  });

  it('the whole group disabled: nothing changes, no tab stop', () => {
    const onChange = vi.fn();
    render(<SegmentedChoice legend="Role" options={ROLES} value="student" onChange={onChange} disabled help="Locked until they finish setting up." />);
    fireEvent.click(radio('Teacher'));
    fireEvent.keyDown(radio('Student'), { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
    expect(tabStops()).toEqual([]);
    expect(screen.getByRole('radiogroup').getAttribute('aria-disabled')).toBe('true');
  });

  it('no value yet: the first enabled option is the tab stop', () => {
    render(<Harness initial={null} options={[{ ...ROLES[0], disabled: true }, ROLES[1], ROLES[2]]} />);
    expect(checked()).toEqual([]);
    expect(tabStops()).toEqual(['Teacher']);
  });

  it('help, error and Optional are wired to the group', () => {
    render(<SegmentedChoice legend="Role" options={ROLES} value="" onChange={() => {}} help="Decides what they can see." error="Choose a role." optional />);
    const group = screen.getByRole('radiogroup');
    const ids = group.getAttribute('aria-describedby').split(' ');
    expect(ids.map(id => document.getElementById(id).textContent)).toEqual(['Choose a role.', 'Decides what they can see.']);
    expect(group.getAttribute('aria-invalid')).toBe('true');
    expect(group.getAttribute('aria-required')).toBeNull();
    expect(screen.getByText('Optional')).toBeTruthy();
  });
});
