// @vitest-environment jsdom
// L1: the Sign In chooser - a non-modal disclosure with two real links.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SignInChooser from './SignInChooser';

afterEach(cleanup);

const setup = (props = {}) => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<><SignInChooser {...props} /><button type="button">Elsewhere</button></>} />
        <Route path="/student-login" element={<h1>Student login page</h1>} />
        <Route path="/faculty-login" element={<h1>Faculty login page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByRole('button', { name: 'Sign In' });
};
const panelOf = button => document.getElementById(button.getAttribute('aria-controls'));
const option = name => screen.getByRole('link', { name: new RegExp(`^${name}`) });

describe('SignInChooser', () => {
  it('starts closed: aria-expanded false, the controlled panel exists and is hidden', () => {
    const button = setup();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panelOf(button)).toBeTruthy();
    expect(panelOf(button).hidden).toBe(true);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('opens on click, names its group, and moves focus to Student', () => {
    const onOpenChange = vi.fn();
    const button = setup({ onOpenChange });
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panelOf(button).hidden).toBe(false);
    expect(screen.getByRole('group', { name: 'SIGN IN AS' })).toBe(panelOf(button));
    expect(document.activeElement).toBe(option('Student'));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });

  it('Student goes to /student-login; Faculty, hinted "Teacher or Admin", goes to /faculty-login', () => {
    fireEvent.click(setup());
    expect(option('Student').getAttribute('href')).toBe('/student-login');
    expect(option('Faculty').getAttribute('href')).toBe('/faculty-login');
    expect(option('Faculty').textContent).toBe('FacultyTeacher or Admin');
    expect(option('Faculty').className).toContain('min-h-12');
  });

  it('arrow keys, Home and End move between the two options and wrap', () => {
    fireEvent.click(setup());
    const student = option('Student'); const faculty = option('Faculty');
    fireEvent.keyDown(student, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(faculty);
    fireEvent.keyDown(faculty, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(student);
    fireEvent.keyDown(student, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(faculty);
    fireEvent.keyDown(faculty, { key: 'Home' });
    expect(document.activeElement).toBe(student);
    fireEvent.keyDown(student, { key: 'End' });
    expect(document.activeElement).toBe(faculty);
  });

  it('Escape closes it and returns focus to the button', () => {
    const button = setup();
    fireEvent.click(button);
    fireEvent.keyDown(option('Student'), { key: 'Escape' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panelOf(button).hidden).toBe(true);
    expect(document.activeElement).toBe(button);
  });

  it('a click or tap outside closes it', () => {
    const button = setup();
    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('a click inside does not close it; a second click on the button does', () => {
    const button = setup();
    fireEvent.click(button);
    fireEvent.pointerDown(option('Faculty'));
    expect(button.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('tabbing away closes it', () => {
    const button = setup();
    fireEvent.click(button);
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    act(() => { fireEvent.blur(option('Faculty'), { relatedTarget: elsewhere }); });
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('choosing an option navigates and closes the chooser', () => {
    fireEvent.click(setup());
    fireEvent.click(option('Faculty'));
    expect(screen.getByRole('heading', { name: 'Faculty login page' })).toBeTruthy();
  });

  it('opens upward when the room below is too small', () => {
    const button = setup();
    const inner = window.innerHeight;
    button.getBoundingClientRect = () => ({ top: inner - 80, bottom: inner - 22, left: 0, right: 250, width: 250, height: 58 });
    fireEvent.click(button);
    expect(panelOf(button).dataset.placement).toBe('up');
    expect(panelOf(button).className).toContain('bottom-full');
  });

  it('does not open upward under the fixed public header', () => {
    const nav = document.createElement('nav'); nav.className = 'fixed';
    nav.getBoundingClientRect = () => ({ top: 0, bottom: 118, left: 0, right: 844, width: 844, height: 118 });
    document.body.appendChild(nav);
    try {
      const button = setup();
      // 844x390: 166px from the top, 166px left below; above the header there is only 48px.
      button.getBoundingClientRect = () => ({ top: 166, bottom: 224, left: 0, right: 250, width: 250, height: 58 });
      const inner = window.innerHeight;
      window.innerHeight = 390;
      fireEvent.click(button);
      window.innerHeight = inner;
      expect(panelOf(button).dataset.placement).toBe('down');
    } finally { nav.remove(); }
  });

  it('opens downward when there is room', () => {
    const button = setup();
    button.getBoundingClientRect = () => ({ top: 100, bottom: 158, left: 0, right: 250, width: 250, height: 58 });
    fireEvent.click(button);
    expect(panelOf(button).dataset.placement).toBe('down');
    expect(panelOf(button).className).toContain('top-full');
  });
});
