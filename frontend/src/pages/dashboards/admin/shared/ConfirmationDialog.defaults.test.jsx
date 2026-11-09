// @vitest-environment jsdom
// Every admin dialog that passes none of the optional section-delete props
// (details, counts, recommendation, confirmName) must render exactly as before.
// EXPECTED_* below were captured from ConfirmationDialog.jsx BEFORE those props
// were added, with this same test.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ConfirmationDialog from './ConfirmationDialog';

const EXPECTED_DESTRUCTIVE = "<div class=\"modal ux-modal\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\":r0:\" tabindex=\"-1\"><div id=\":r0:\" class=\"modal-title ux-modal-title\">Delete Post?</div><div class=\"ux-modal-body\"><div style=\"text-align: center;\"><div style=\"margin-bottom: var(--space-12); display: flex; justify-content: center;\"><div style=\"width: 52px; height: 52px; border-radius: 50%; background: rgba(239, 68, 68, 0.12); display: flex; align-items: center; justify-content: center;\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"26\" height=\"26\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"var(--red)\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-alert-triangle \"><path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z\"></path><path d=\"M12 9v4\"></path><path d=\"M12 17h.01\"></path></svg></div></div><p style=\"font-size: var(--font-size-13); color: var(--text-muted); margin-bottom: var(--space-8); line-height: 1.6;\">This post will be permanently deleted.</p><p style=\"font-size: var(--font-size-14); font-weight: 700; color: var(--text); margin-bottom: var(--space-4);\">Release notice</p><p style=\"font-size: var(--font-size-12); color: var(--red); margin-top: var(--space-12); margin-bottom: var(--space-24);\">This cannot be undone.</p></div></div><div class=\"modal-actions ux-modal-footer\"><button type=\"button\" class=\"btn btn-ghost\">Cancel</button><button type=\"button\" class=\"btn btn-primary btn-danger-solid\">Yes, Delete</button></div></div>";
const EXPECTED_PLAIN = "<div class=\"modal ux-modal\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\":r1:\" tabindex=\"-1\"><div id=\":r1:\" class=\"modal-title ux-modal-title\">Sign Out?</div><div class=\"ux-modal-body\"><div style=\"text-align: center;\"><div style=\"margin-bottom: var(--space-12); display: flex; justify-content: center;\"><div style=\"width: 52px; height: 52px; border-radius: 50%; background: var(--card2); display: flex; align-items: center; justify-content: center;\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"26\" height=\"26\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-log-out \"><path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\"></path><polyline points=\"16 17 21 12 16 7\"></polyline><line x1=\"21\" x2=\"9\" y1=\"12\" y2=\"12\"></line></svg></div></div><p style=\"font-size: var(--font-size-13); color: var(--text-muted); margin-bottom: var(--space-8); line-height: 1.6;\">Are you sure you want to sign out?</p><span class=\"badge badge-green\" style=\"margin-bottom: var(--space-12); display: inline-block;\">Teacher</span></div></div><div class=\"modal-actions ux-modal-footer\"><button type=\"button\" class=\"btn btn-ghost\">Cancel</button><button type=\"button\" class=\"btn btn-primary\">Sign Out</button></div></div>";

afterEach(cleanup);

const dialogHtml = () => screen.getByRole('dialog').outerHTML;

describe('ConfirmationDialog default rendering', () => {
  it('a destructive dialog with no new props renders exactly as before', () => {
    render(<ConfirmationDialog open title="Delete Post?" description="This post will be permanently deleted."
      subject="Release notice" warning="This cannot be undone." confirmLabel="Yes, Delete" destructive
      onCancel={() => {}} onConfirm={() => {}} />);
    expect(dialogHtml()).toBe(EXPECTED_DESTRUCTIVE);
    expect(screen.getByRole('button', { name: 'Yes, Delete' }).hasAttribute('disabled')).toBe(false);
  });

  it('a non-destructive dialog with a role badge renders exactly as before', () => {
    render(<ConfirmationDialog open title="Sign Out?" description="Are you sure you want to sign out?"
      role="teacher" confirmLabel="Sign Out" busy={false}
      onCancel={() => {}} onConfirm={() => {}} />);
    expect(dialogHtml()).toBe(EXPECTED_PLAIN);
  });
});
