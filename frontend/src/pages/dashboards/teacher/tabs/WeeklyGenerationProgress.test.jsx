// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import WeeklyGenerationProgress from './WeeklyGenerationProgress';

const advance = milliseconds => act(() => vi.advanceTimersByTime(milliseconds));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('rotates honest status lines every nine seconds and switches to the longer-wait line at three minutes', () => {
  vi.useFakeTimers();
  const { container } = render(<WeeklyGenerationProgress plannedCalls={15} />);
  expect(screen.getByText('AI is generating your weekly worksheets')).toBeTruthy();
  const announcement = screen.getByRole('status').textContent;
  const current = () => screen.getByTestId('weekly-generation-current').textContent;
  expect(current()).toBe('Please keep this page open while we work.');
  advance(9000);
  expect(current()).toBe('Creating questions based on your lesson plan.');
  advance(9000);
  expect(current()).toBe('Large worksheets can take several minutes.');
  advance(9000);
  expect(current()).toBe('The service may pause briefly to stay within usage limits.');
  expect(screen.getByRole('status').textContent).toBe(announcement);
  advance(9000);
  expect(current()).toBe('Still working on your weekly worksheets. Thank you for waiting.');
  expect(screen.getByRole('status').textContent).not.toBe(announcement);
  advance(9000);
  expect(current()).toBe('Please keep this page open while we work.');
  advance(135000);
  expect(current()).toBe('This is taking longer than usual. Please keep this page open.');
  expect(screen.getByText('Elapsed: 3:00')).toBeTruthy();
  expect(container.textContent).not.toMatch(/groq|gemini|openai/i);
});

it('shows an estimated bar below 95 percent and stops its timer at the ten-minute cap', () => {
  vi.useFakeTimers();
  render(<WeeklyGenerationProgress plannedCalls={10} />);
  const bar = screen.getByRole('progressbar', { name: 'Estimated progress' });
  expect(bar.hasAttribute('aria-valuenow')).toBe(false);
  expect(bar.getAttribute('aria-valuemin')).toBe('0');
  expect(bar.getAttribute('aria-valuemax')).toBe('100');
  advance(600000);
  const width = Number.parseFloat(screen.getByTestId('weekly-generation-fill').style.width);
  expect(width).toBeGreaterThan(0);
  expect(width).toBeLessThan(95);
  expect(screen.getByText('Elapsed: 10:00')).toBeTruthy();
  expect(vi.getTimerCount()).toBe(0);
  advance(60000);
  expect(screen.getByTestId('weekly-generation-fill').style.width).toBe(`${width}%`);
});

it('briefly fills to 100 percent on completion, then calls the existing success transition', () => {
  vi.useFakeTimers();
  const onComplete = vi.fn();
  const { rerender } = render(<WeeklyGenerationProgress plannedCalls={15} onComplete={onComplete} />);
  advance(12000);
  rerender(<WeeklyGenerationProgress plannedCalls={15} completed onComplete={onComplete} />);
  expect(screen.getByTestId('weekly-generation-fill').style.width).toBe('100%');
  expect(onComplete).not.toHaveBeenCalled();
  advance(400);
  expect(onComplete).toHaveBeenCalledTimes(1);
});

it('cleans running and completion timers when closed, canceled, errored, or unmounted', () => {
  vi.useFakeTimers();
  const first = render(<WeeklyGenerationProgress plannedCalls={15} />);
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  first.unmount();
  expect(vi.getTimerCount()).toBe(0);
  const second = render(<WeeklyGenerationProgress plannedCalls={15} completed onComplete={vi.fn()} />);
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  second.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('uses static text with no cross-fade for reduced motion', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  render(<WeeklyGenerationProgress plannedCalls={15} />);
  advance(9000);
  expect(screen.getByTestId('weekly-generation-current').textContent)
    .toBe('Creating questions based on your lesson plan.');
  expect(screen.queryByTestId('weekly-generation-old')).toBeNull();
  expect(screen.getByTestId('weekly-generation-fill').className).toContain('reduced');
});
