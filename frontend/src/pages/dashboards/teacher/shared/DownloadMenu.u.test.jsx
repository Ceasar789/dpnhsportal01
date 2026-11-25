// @vitest-environment jsdom
// U-PDF-T: the Download menu (plan view p16, worksheet preview p18) and the
// stylesheet for the document scroll areas.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import DownloadMenu from './DownloadMenu';

afterEach(cleanup);
const items = () => [
  { key: 'a', label: 'Student copy (.docx)', hint: 'Without answers', run: vi.fn() },
  { key: 'b', label: 'Key to correction (.docx)', run: vi.fn() },
  { key: 'c', label: 'Print / PDF', icon: 'print', run: vi.fn(), disabled: true },
];

describe('DownloadMenu', () => {
  it('opens a labelled menu; an item runs its export and closes the menu, focus back on the button', () => {
    const list = items();
    render(<DownloadMenu items={list} name="Quiz 1" />);
    const trigger = screen.getByRole('button', { name: 'Download Quiz 1' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Download Quiz 1' });
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(3);
    expect(within(menu).getByRole('menuitem', { name: /Print/ }).disabled).toBe(true);
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Key to correction/ }));
    expect(list[1].run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('arrow keys move through the items; Escape closes and returns focus', async () => {
    render(<DownloadMenu items={items()} />);
    const trigger = screen.getByRole('button', { name: /Download/ });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    await new Promise(resolve => requestAnimationFrame(resolve));
    const menu = screen.getByRole('menu');
    expect(document.activeElement.textContent).toContain('Student copy');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement.textContent).toContain('Key to correction');
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe('doc-scroll.css', () => {
  const file = ['src', 'frontend/src'].map(p => join(p, 'pages/dashboards/teacher/shared/doc-scroll.css')).find(p => existsSync(p));
  const css = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  it('bounded, contained, keyboard-visible scroll area; print shows everything; no theme literal, no !important, no motion', () => {
    expect(css).toContain('max-height: var(--t-doc-max, none);');
    expect(css).toContain('overflow-y: auto;');
    expect(css).toContain('overscroll-behavior: contain;');
    expect(css).toMatch(/\.t-doc-scroll:focus-visible \{\s*outline: 2px solid/);
    expect(css).toMatch(/@media print \{\s*\.t-doc-scroll \{ max-height: none; overflow: visible; \}/);
    expect(css).not.toContain(['theme', 'clarity'].join('-'));
    expect(css).not.toMatch(/!important|transition|animation/);
  });
});
