// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ThemeContext } from '../hooks';
import { Btn, Modal } from './ui';

// useId values depend on render order, so they are normalised before comparing.
const normalise = html => html.replace(/:r[0-9a-z]+:/g, ':id:');

const NoFooter = ({ dark = false }) => (
  <ThemeContext.Provider value={{ dark }}>
    <Modal title="Submit your answers?" onClose={() => {}} escapeCloses closeDisabled={false}>
      <p className="text-sm mb-5">You can no longer change them after this.</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Btn variant="outline" className="min-h-11">Cancel</Btn>
        <Btn variant="primary" className="min-h-11">Submit</Btn>
      </div>
    </Modal>
  </ThemeContext.Provider>
);

afterEach(cleanup);

// Captured from the Modal at HEAD (before the footer slot existed), with the
// same harness. A caller that does not pass a footer must still produce it.
const BEFORE = {
  light: "<div class=\"fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4\"><div role=\"dialog\" aria-modal=\"true\" aria-labelledby=\":id:\" tabindex=\"-1\" class=\"rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-viewport-85\" style=\"background-color: rgb(255, 255, 255); border: 1px solid rgb(226, 232, 240);\"><div class=\"flex items-center justify-between p-5 border-b flex-shrink-0\" style=\"border-color: rgb(226, 232, 240);\"><h2 id=\":id:\" class=\"text-lg font-bold\" style=\"color: rgb(26, 43, 74);\">Submit your answers?</h2><button type=\"button\" aria-label=\"Close Submit your answers?\" class=\"min-h-11 min-w-11 flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-50\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-x \" aria-hidden=\"true\"><path d=\"M18 6 6 18\"></path><path d=\"m6 6 12 12\"></path></svg></button></div><div class=\"p-5 overflow-y-auto\"><p class=\"text-sm mb-5\">You can no longer change them after this.</p><div class=\"flex flex-wrap justify-end gap-2\"><button type=\"button\" class=\"flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 min-h-11\" style=\"background-color: transparent; color: var(--text-muted); border: 1px solid var(--border); opacity: 1;\">Cancel</button><button type=\"button\" class=\"flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 min-h-11\" style=\"background-color: rgb(37, 99, 235); color: rgb(255, 255, 255); opacity: 1;\">Submit</button></div></div></div></div>",
  dark: "<div class=\"fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4\"><div role=\"dialog\" aria-modal=\"true\" aria-labelledby=\":id:\" tabindex=\"-1\" class=\"rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-viewport-85\" style=\"background-color: rgb(30, 41, 59); border: 1px solid rgb(51, 65, 85);\"><div class=\"flex items-center justify-between p-5 border-b flex-shrink-0\" style=\"border-color: rgb(51, 65, 85);\"><h2 id=\":id:\" class=\"text-lg font-bold\" style=\"color: rgb(241, 245, 249);\">Submit your answers?</h2><button type=\"button\" aria-label=\"Close Submit your answers?\" class=\"min-h-11 min-w-11 flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-50\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-x \" aria-hidden=\"true\"><path d=\"M18 6 6 18\"></path><path d=\"m6 6 12 12\"></path></svg></button></div><div class=\"p-5 overflow-y-auto\"><p class=\"text-sm mb-5\">You can no longer change them after this.</p><div class=\"flex flex-wrap justify-end gap-2\"><button type=\"button\" class=\"flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 min-h-11\" style=\"background-color: transparent; color: var(--text-muted); border: 1px solid var(--border); opacity: 1;\">Cancel</button><button type=\"button\" class=\"flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 min-h-11\" style=\"background-color: rgb(37, 99, 235); color: rgb(255, 255, 255); opacity: 1;\">Submit</button></div></div></div></div>",
};

describe('Modal without a footer renders exactly as before', () => {
  it.each(['light', 'dark'])('%s theme markup is unchanged', (theme) => {
    render(<NoFooter dark={theme === 'dark'} />);
    expect(normalise(screen.getByRole('dialog').parentElement.outerHTML)).toBe(BEFORE[theme]);
    expect(document.querySelector('[data-modal-footer]')).toBeNull();
  });
});

describe('Modal with a footer', () => {
  const WithFooter = () => (
    <ThemeContext.Provider value={{ dark: false }}>
      <Modal title="Distribute worksheet" onClose={() => {}} footer={<div><Btn>Cancel</Btn><Btn variant="primary">Review</Btn></div>}>
        <label>Section<input /></label>
      </Modal>
    </ThemeContext.Provider>
  );

  it('pins the footer outside the scrolling body, after it, inside the dialog', () => {
    render(<WithFooter />);
    const dialog = screen.getByRole('dialog', { name: 'Distribute worksheet' });
    const footer = dialog.querySelector('[data-modal-footer]');
    const body = dialog.querySelector('.overflow-y-auto');
    expect(footer).toBeTruthy();
    expect(footer.parentElement).toBe(dialog);
    expect(body.contains(footer)).toBe(false);
    expect(body.nextElementSibling).toBe(footer);
    expect(footer.className).toContain('flex-shrink-0');
    expect(footer.className).toContain('border-t');
    expect(footer.style.paddingBottom).toContain('safe-area-inset-bottom');
    expect(footer.contains(screen.getByRole('button', { name: 'Review' }))).toBe(true);
    expect(body.contains(screen.getByLabelText('Section'))).toBe(true);
  });

  it('gives the body scroll-padding-bottom equal to the footer height', () => {
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return this.hasAttribute('data-modal-footer') ? 68 : 0; } });
    try {
      render(<WithFooter />);
      expect(screen.getByRole('dialog').querySelector('.overflow-y-auto').style.scrollPaddingBottom).toBe('68px');
    } finally {
      if (height) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', height);
    }
  });
});
