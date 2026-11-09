// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { useEffect } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useToast } from './hooks';

const api = {};
const Harness = () => {
  const { showToast, Toast } = useToast();
  useEffect(() => { api.show = showToast; }, [showToast]);
  return <Toast />;
};

afterEach(() => cleanup());

describe('student toast live regions', () => {
  it('announces errors in an alert and other messages in a status, without remounting the regions', () => {
    render(<Harness />);
    const status = screen.getByRole('status');
    const alert = screen.getByRole('alert');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(alert.getAttribute('aria-live')).toBe('assertive');

    act(() => api.show('Could not save.', 'error'));
    expect(screen.getByRole('alert')).toBe(alert);
    expect(alert.textContent).toBe('Could not save.');
    expect(status.textContent).toBe('');

    act(() => api.show('Saved.'));
    expect(screen.getByRole('status')).toBe(status);
    expect(status.textContent).toBe('Saved.');
    expect(alert.textContent).toBe('');
  });
});
