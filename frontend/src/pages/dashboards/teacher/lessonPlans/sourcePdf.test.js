// 4j: the source PDF opens through a signed link; the stored public link is only the fallback.
import { describe, expect, it, vi } from 'vitest';
import { openSourcePdf, sourcePdfUrl, SOURCE_PDF_BUCKET } from './sourcePdf';

const clientWith = (result) => {
  const createSignedUrl = vi.fn(async () => result);
  const from = vi.fn(() => ({ createSignedUrl }));
  return { client: { storage: { from } }, from, createSignedUrl };
};
const plan = { file_path: 'teacher-a/1_x.pdf', file_url: 'https://public.example/lesson-pdfs/teacher-a/1_x.pdf' };

describe('sourcePdfUrl', () => {
  it('signs the stored path in the lesson-pdfs bucket for 5 minutes', async () => {
    const c = clientWith({ data: { signedUrl: 'https://signed.example/x?token=1' }, error: null });
    expect(await sourcePdfUrl(plan, c.client)).toBe('https://signed.example/x?token=1');
    expect(c.from).toHaveBeenCalledWith(SOURCE_PDF_BUCKET);
    expect(c.createSignedUrl).toHaveBeenCalledWith('teacher-a/1_x.pdf', 300);
  });
  it('falls back to the stored link when signing fails or there is no path', async () => {
    expect(await sourcePdfUrl(plan, clientWith({ data: null, error: { message: 'denied' } }).client)).toBe(plan.file_url);
    const c = clientWith({ data: { signedUrl: 'never' }, error: null });
    expect(await sourcePdfUrl({ file_url: 'u' }, c.client)).toBe('u');
    expect(c.createSignedUrl).not.toHaveBeenCalled();
    expect(await sourcePdfUrl({}, c.client)).toBe(null);
  });
});

describe('openSourcePdf', () => {
  it('opens the tab inside the click, then points it at the signed link without an opener', async () => {
    const tab = { location: { href: '' }, opener: 'x', close: vi.fn() };
    const openWindow = vi.fn(() => tab);
    const c = clientWith({ data: { signedUrl: 'https://signed.example/y' }, error: null });
    expect(await openSourcePdf(plan, c.client, openWindow)).toBe(true);
    expect(openWindow).toHaveBeenCalledWith('about:blank', '_blank');
    expect(tab.location.href).toBe('https://signed.example/y');
    expect(tab.opener).toBe(null);
  });
  it('closes the empty tab when there is no link', async () => {
    const tab = { location: { href: '' }, close: vi.fn() };
    expect(await openSourcePdf({}, clientWith({}).client, () => tab)).toBe(false);
    expect(tab.close).toHaveBeenCalled();
  });
});
