// @vitest-environment jsdom
// F2b: a stored news audience the app no longer offers (faculty, registrar,
// the old staff set) is shown as stored, never as "All Users", and the edit
// form keeps it selected so saving an old post does not retarget it.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));
import NewsTab from './NewsTab';

const post = (id, target_roles) => ({
  id, title: `Post ${id}`, content: 'Body', category: 'Announcements', status: 'Published',
  author: 'Admin', created_at: '2026-11-01T00:00:00Z', target_roles,
});

beforeEach(() => {
  h.ctx = {
    modal: null, filteredNews: [], newsItems: [], newsLoading: false,
    nTitle: 'Old post', nCat: 'Announcements', nAuthor: '', nContent: 'Body', nStatus: 'Published',
    nTarget: 'all', nCustomTarget: '', nExpiresDate: '', nImageUrl: '',
    nImageFile: null, newsSearch: '', newsCatF: '', newsStatF: '',
    closeModal: vi.fn(), setNTarget: vi.fn(),
  };
});
afterEach(cleanup);

const targetText = (id) => screen.getByText(`Post ${id}`).closest('.news-card').textContent;

describe('news list audience label', () => {
  it('known and custom audiences read exactly as before; a missing one is All Users', () => {
    h.ctx.filteredNews = [post('a', 'all'), post('s', 'student'), post('t', 'teacher'), post('c', 'custom:Grade 7 parents'), post('n', null)];
    render(<NewsTab />);
    expect(targetText('a')).toContain('All Users');
    expect(targetText('s')).toContain('Students Only');
    expect(targetText('t')).toContain('Teachers Only');
    expect(targetText('c')).toContain('Grade 7 parents');
    expect(targetText('n')).toContain('All Users');
  });

  it.each(['faculty', 'registrar', 'teacher,faculty,registrar'])('an old %j post shows its stored audience, not All Users', (stored) => {
    h.ctx.filteredNews = [post('x', stored)];
    render(<NewsTab />);
    expect(targetText('x')).toContain(stored);
    expect(targetText('x')).not.toContain('All Users');
  });
});

const optionsOf = select => [...select.querySelectorAll('option')].map(o => ({ value: o.value, label: o.textContent, disabled: o.disabled }));

describe('news edit form audience select', () => {
  it('a new or known-audience post offers exactly the four options, nothing extra', () => {
    h.ctx.modal = 'news';
    for (const nTarget of ['all', 'student', 'teacher', 'custom']) {
      h.ctx.nTarget = nTarget;
      render(<NewsTab />);
      const select = document.getElementById('news-target-audience');
      expect(select.value).toBe(nTarget);
      expect(optionsOf(select).map(o => o.value)).toEqual(['all', 'student', 'teacher', 'custom']);
      cleanup();
    }
  });

  it.each(['faculty', 'registrar', 'teacher,faculty,registrar'])('editing an old %j post keeps that audience selected, disabled', (stored) => {
    h.ctx.modal = 'news';
    h.ctx.nTarget = stored;
    render(<NewsTab />);
    const select = document.getElementById('news-target-audience');
    expect(select.value).toBe(stored);
    expect(optionsOf(select)).toContainEqual({ value: stored, label: `${stored} (no longer offered)`, disabled: true });
    expect(optionsOf(select).filter(o => !o.disabled).map(o => o.value)).toEqual(['all', 'student', 'teacher', 'custom']);
  });
});
