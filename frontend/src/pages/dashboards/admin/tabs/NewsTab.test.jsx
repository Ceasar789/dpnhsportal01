// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));
import NewsTab from './NewsTab';

let liveUrls;
let nextUrl;
const file = (name) => new File(['image'], name, { type: 'image/png' });
const screen = () => <StrictMode><NewsTab /></StrictMode>;

beforeEach(() => {
  liveUrls = new Set();
  nextUrl = 0;
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL() {
      const url = `blob:news-preview-${++nextUrl}`;
      liveUrls.add(url);
      return url;
    }
    static revokeObjectURL(url) { liveUrls.delete(url); }
  });
  h.ctx = {
    modal: 'news', filteredNews: [], newsItems: [], newsLoading: false,
    nTitle: '', nCat: 'Academics', nAuthor: '', nContent: '', nStatus: 'Draft',
    nTarget: 'all', nCustomTarget: '', nExpiresDate: '', nImageUrl: '',
    nImageFile: null, newsSearch: '', newsCatF: '', newsStatF: '',
    closeModal: vi.fn(),
  };
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('news preview resource lifetime', () => {
  it('keeps only the displayed file alive through replacement and removal', () => {
    const view = render(screen());
    h.ctx.nImageFile = file('first.png');
    view.rerender(screen());
    const first = view.container.querySelector('.news-image-preview img').src;
    expect(liveUrls).toEqual(new Set([first]));

    h.ctx.nImageFile = file('replacement.png');
    view.rerender(screen());
    const replacement = view.container.querySelector('.news-image-preview img').src;
    expect(replacement).not.toBe(first);
    expect(liveUrls).toEqual(new Set([replacement]));

    h.ctx.nImageFile = null;
    view.rerender(screen());
    expect(view.container.querySelector('.news-image-preview')).toBeNull();
    expect(liveUrls.size).toBe(0);
  });

  it('releases the staged file when the modal closes but the tab stays mounted', () => {
    const view = render(screen());
    h.ctx.nImageFile = file('cancelled.png');
    view.rerender(screen());
    h.ctx.modal = null;
    view.rerender(screen());
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    expect(liveUrls.size).toBe(0);
  });

  it('shows a live URL after StrictMode mounts and releases it on unmount', () => {
    h.ctx.nImageFile = file('existing-stage.png');
    const view = render(screen());
    const displayed = view.container.querySelector('.news-image-preview img').src;
    expect(liveUrls).toEqual(new Set([displayed]));
    view.unmount();
    expect(liveUrls.size).toBe(0);
  });
});
