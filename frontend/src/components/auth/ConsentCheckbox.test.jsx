// @vitest-environment jsdom
// B2: the shared consent checkbox for both login pages.
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConsentCheckbox from './ConsentCheckbox';

afterEach(cleanup);

const Harness = ({ error = false, onToggle = () => {} }) => {
  const [checked, setChecked] = useState(false);
  return <ConsentCheckbox id="t-consent" checked={checked} error={error}
    onChange={(e) => { setChecked(e.target.checked); onToggle(e.target.checked); }} />;
};
const box = () => screen.getByRole('checkbox', { name: /agree to the terms of use/i });

describe('ConsentCheckbox', () => {
  it('is a real, unchecked checkbox named by the whole agreement', () => {
    render(<Harness />);
    expect(box().type).toBe('checkbox');
    expect(box().checked).toBe(false);
    expect(box().id).toBe('t-consent');
    expect(screen.getByRole('checkbox', { name: 'I agree to the Terms of Use and Privacy Statement.' })).toBe(box());
  });

  it('the two links open the pages in a new tab, safely', () => {
    render(<Harness />);
    const terms = screen.getByRole('link', { name: 'Terms of Use' });
    const privacy = screen.getByRole('link', { name: 'Privacy Statement' });
    expect(terms.getAttribute('href')).toBe('/terms');
    expect(privacy.getAttribute('href')).toBe('/privacy');
    for (const link of [terms, privacy]) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('clicking a link never toggles the box; clicking the text does', () => {
    const onToggle = vi.fn();
    render(<Harness onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('link', { name: 'Terms of Use' }));
    fireEvent.click(screen.getByRole('link', { name: 'Privacy Statement' }));
    expect(box().checked).toBe(false);
    expect(onToggle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(/I agree to the/));
    expect(box().checked).toBe(true);
  });

  it('with an error: alert text under the box, aria-invalid and aria-describedby', () => {
    render(<Harness error />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Please agree to the Terms of Use and Privacy Statement to sign in.');
    expect(box().getAttribute('aria-invalid')).toBe('true');
    expect(box().getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('without an error: no alert and no invalid state', () => {
    render(<Harness />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(box().hasAttribute('aria-invalid')).toBe(false);
    expect(box().hasAttribute('aria-describedby')).toBe(false);
  });

  it('a 40px tap height, 16px text on phones, and a visible focus ring', () => {
    render(<Harness />);
    const label = box().closest('label');
    expect(label.className).toMatch(/\bmin-h-10\b/);
    expect(label.className).toMatch(/\btext-base\b/);
    expect(box().className).toContain('focus-visible:ring-2');
  });
});
