// @vitest-environment jsdom
// U3: the small optional props added to the U2 kit for the user dialog.
// Field `helpLive`, SegmentedChoice `id`, FormErrorSummary `id`. Without them
// nothing changes (the U2 tests cover that).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Field from './Field';
import SegmentedChoice from './SegmentedChoice';
import FormErrorSummary from './FormErrorSummary';

afterEach(cleanup);

describe('Field helpLive', () => {
  it('makes the help text a polite live region; off by default', () => {
    render(<><Field label="LRN" id="lrn" help="Digits only (0-9)." helpLive><input /></Field><Field label="Name" id="nm" help="As on the school record."><input /></Field></>);
    expect(document.getElementById('lrn-help').getAttribute('aria-live')).toBe('polite');
    expect(document.getElementById('nm-help').getAttribute('aria-live')).toBeNull();
  });
});

describe('fixed ids', () => {
  it('SegmentedChoice id gives stable legend, help and error ids', () => {
    render(<SegmentedChoice id="users-role" legend="Role" options={[{ value: 'a', label: 'A' }]} value="a" onChange={() => {}} help="Help." error="Error." />);
    const group = screen.getByRole('radiogroup', { name: 'Role' });
    expect(group.getAttribute('aria-labelledby')).toBe('users-role-label');
    expect(group.getAttribute('aria-describedby')).toBe('users-role-label-error users-role-label-help');
  });

  it('FormErrorSummary id gives a stable title id', () => {
    render(<FormErrorSummary id="users-form-summary" errors={[{ fieldId: 'x', message: 'Fix x.' }]} attempt={1} />);
    expect(screen.getByRole('alert').getAttribute('aria-labelledby')).toBe('users-form-summary-title');
    expect(document.getElementById('users-form-summary-title').textContent).toBe('Please fix 1 thing:');
  });

  it('two renders with the same fixed ids produce identical markup (what the classic/Clarity parity test relies on)', () => {
    const markup = () => {
      const { container, unmount } = render(<><span /><SegmentedChoice id="r" legend="Role" options={[{ value: 'a', label: 'A' }]} value="a" onChange={() => {}} /><FormErrorSummary id="s" errors={[{ fieldId: 'x', message: 'm' }]} /></>);
      const html = container.innerHTML; unmount(); return html;
    };
    const first = markup();
    render(<><span /><span /><span /></>);   // shifts React's useId counter
    expect(markup()).toBe(first);
  });
});
