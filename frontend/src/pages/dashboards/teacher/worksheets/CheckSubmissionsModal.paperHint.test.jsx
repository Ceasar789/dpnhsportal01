// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ThemeContext } from '../hooks';
import CheckSubmissionsModal from './CheckSubmissionsModal';

afterEach(cleanup);

const open = (props = {}) => render(<ThemeContext.Provider value={{ dark: false }}><CheckSubmissionsModal
  worksheet={{ id: 'w1', title: 'Unit quiz', checking_mode: 'manual' }}
  loadItems={vi.fn(async () => ({ items: [], keys: {} }))} loadSubmissions={vi.fn(async () => [])}
  loadAnswers={vi.fn()} releaseScore={vi.fn()} onClose={vi.fn()} {...props} />
</ThemeContext.Provider>);

describe('the empty-list hint about paper scores', () => {
  it('does not point to Encode scores while paper scores are hidden (the default)', async () => {
    open();
    const hint = await screen.findByText(/No one has answered this worksheet in the app yet\./, {}, { timeout: 4000 });
    expect(hint.textContent).not.toMatch(/Encode scores|on paper/);
  });

  it('points to Encode scores when paper scores are available', async () => {
    open({ paperScoresAvailable: true });
    const hint = await screen.findByText(/No one has answered this worksheet in the app yet\./, {}, { timeout: 4000 });
    expect(hint.textContent).toMatch(/If your class answered it\s+on paper, use Encode scores on the worksheet card instead\./);
  });
});
