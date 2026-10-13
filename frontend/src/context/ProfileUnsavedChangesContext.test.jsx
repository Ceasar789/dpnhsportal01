// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ProfileUnsavedChangesProvider,
  useProfileUnsavedChanges,
} from './ProfileUnsavedChangesContext';

const Harness = ({ guard }) => {
  const { registerProfileGuard, requestProfileNavigation } = useProfileUnsavedChanges();

  return (
    <>
      <button type="button" onClick={() => registerProfileGuard(guard)}>Register guard</button>
      <button type="button" onClick={() => requestProfileNavigation(guard.destination)}>Leave</button>
    </>
  );
};

afterEach(cleanup);

describe('ProfileUnsavedChangesProvider', () => {
  it('runs navigation immediately when no dirty Profile guard is active', () => {
    const destination = vi.fn();
    const guard = { shouldBlock: vi.fn(), requestLeave: vi.fn(), destination };
    render(<ProfileUnsavedChangesProvider><Harness guard={guard} /></ProfileUnsavedChangesProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(destination).toHaveBeenCalledTimes(1);
    expect(guard.requestLeave).not.toHaveBeenCalled();
  });

  it('delegates navigation to the active dirty Profile guard', () => {
    const destination = vi.fn();
    const guard = { shouldBlock: vi.fn(() => true), requestLeave: vi.fn(), destination };
    render(<ProfileUnsavedChangesProvider><Harness guard={guard} /></ProfileUnsavedChangesProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Register guard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));

    expect(guard.requestLeave).toHaveBeenCalledWith(destination);
    expect(destination).not.toHaveBeenCalled();
  });

  it('allows navigation through a registered clean Profile guard', () => {
    const destination = vi.fn();
    const guard = { shouldBlock: vi.fn(() => false), requestLeave: vi.fn(), destination };
    render(<ProfileUnsavedChangesProvider><Harness guard={guard} /></ProfileUnsavedChangesProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Register guard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));

    expect(guard.shouldBlock).toHaveBeenCalledTimes(1);
    expect(destination).toHaveBeenCalledTimes(1);
    expect(guard.requestLeave).not.toHaveBeenCalled();
  });
});
