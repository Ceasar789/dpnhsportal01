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
    expect(parseFloat(panelOf(button).style.top)).toBeLessThan(inner - 80);
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
    expect(panelOf(button).style.top).toBe('166px');
  });

  it('Space on a focused option opens it, like Enter', () => {
    fireEvent.click(setup());
    fireEvent.keyDown(option('Student'), { key: ' ' });
    expect(screen.getByRole('heading', { name: 'Student login page' })).toBeTruthy();
  });

  it('Space on Faculty opens the Faculty login', () => {
    fireEvent.click(setup());
    fireEvent.keyDown(option('Student'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(option('Faculty'));
    fireEvent.keyDown(option('Faculty'), { key: ' ' });
    expect(screen.getByRole('heading', { name: 'Faculty login page' })).toBeTruthy();
  });

  it('renders the panel in <body>, fixed, above the public header (z-50)', () => {
    const button = setup();
    fireEvent.click(button);
    const panel = panelOf(button);
    expect(panel.parentElement).toBe(document.body);
    expect(panel.style.position).toBe('fixed');
    expect(Number(panel.style.zIndex)).toBeGreaterThan(50);
  });

  it('never places the panel under the fixed public header', () => {
    const nav = document.createElement('nav'); nav.className = 'fixed';
    nav.getBoundingClientRect = () => ({ top: 0, bottom: 118, left: 0, right: 390, width: 390, height: 118 });
    document.body.appendChild(nav);
    try {
      const button = setup();
      // The button scrolled up against the header, little room above it.
      button.getBoundingClientRect = () => ({ top: 120, bottom: 178, left: 0, right: 250, width: 250, height: 58 });
      fireEvent.click(button);
      expect(parseFloat(panelOf(button).style.top)).toBeGreaterThanOrEqual(126);
      fireEvent.click(button);
      // Opening upward with less room above than the panel needs: it stops at the header.
      const innerH = window.innerHeight;
      window.innerHeight = 390;
      button.getBoundingClientRect = () => ({ top: 300, bottom: 358, left: 0, right: 250, width: 250, height: 58 });
      fireEvent.click(button);
      window.innerHeight = innerH;
      expect(panelOf(button).dataset.placement).toBe('up');
      expect(panelOf(button).style.top).toBe('126px');
      expect(panelOf(button).style.maxHeight).toBe('166px');
      fireEvent.click(button);
      // Opened while the button is half under the header: still below it.
      button.getBoundingClientRect = () => ({ top: 60, bottom: 110, left: 0, right: 250, width: 250, height: 58 });
      fireEvent.click(button);
      expect(panelOf(button).style.top).toBe('126px');
    } finally { nav.remove(); }
  });

  it('stays inside a 320px screen with a 16px gutter', () => {
    const innerW = window.innerWidth;
    window.innerWidth = 320;
    try {
      const button = setup();
      button.getBoundingClientRect = () => ({ top: 100, bottom: 158, left: 10, right: 310, width: 300, height: 58 });
      fireEvent.click(button);
      const { style } = panelOf(button);
      expect(parseFloat(style.width)).toBeLessThanOrEqual(288);
      expect(parseFloat(style.left)).toBeGreaterThanOrEqual(16);
      expect(parseFloat(style.left) + parseFloat(style.width)).toBeLessThanOrEqual(304);
    } finally { window.innerWidth = innerW; }
  });

  it('a mousedown in the panel is cancelled, so nothing blurs and closes it before the click', () => {
    const button = setup();
    fireEvent.click(button);
    expect(fireEvent.mouseDown(option('Faculty'))).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(option('Faculty'));
    expect(screen.getByRole('heading', { name: 'Faculty login page' })).toBeTruthy();
  });

  it('Tab from the last option closes it and continues from the Sign In button', () => {
    const button = setup();
    fireEvent.click(button);
    expect(fireEvent.keyDown(option('Faculty'), { key: 'Tab' })).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('Shift+Tab from Student closes it and lands on the Sign In button', () => {
    const button = setup();
    fireEvent.click(button);
    expect(fireEvent.keyDown(option('Student'), { key: 'Tab', shiftKey: true })).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('closes once the button has scrolled out of view', () => {
    const button = setup();
    fireEvent.click(button);
    button.getBoundingClientRect = () => ({ top: -100, bottom: -42, left: 0, right: 250, width: 250, height: 58 });
    act(() => { window.dispatchEvent(new Event('scroll')); });
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
