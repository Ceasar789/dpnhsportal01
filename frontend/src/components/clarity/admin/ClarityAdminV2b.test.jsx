// @vitest-environment jsdom
// V2b-1: Admin tabs - each empty state says what to do next and offers the
// action; on one-column layouts a tapped user's profile comes into view.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../../../pages/dashboards/admin/AdminContext', () => ({ useAdminContext: () => h.ctx }));
vi.mock('../../../lib/useMediaQuery', () => ({ useIsNarrow: () => false, useMediaQuery: () => false }));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => null }));
vi.mock('../../../pages/dashboards/admin/shared/StudentProfileSheet', () => ({ default: () => null }));

import ClarityAdminUsersTab from './ClarityAdminUsersTab';
import ClarityAdminMemosTab from './ClarityAdminMemosTab';
import ClarityAdminNewsTab from './ClarityAdminNewsTab';
import ClarityAdminSectionsTab from './ClarityAdminSectionsTab';

const USERS = [
  { id: 'u1', name: 'Ana Santos', email: 'ana@example.test', role: 'teacher', status: 'active' },
  { id: 'u2', name: 'Ben Cruz', email: 'ben@example.test', role: 'student', status: 'active', lrn: '108123456789' },
];
const usersCtx = (extra = {}) => ({
  closeModal: vi.fn(), deleteUser: vi.fn(), restoreUser: vi.fn(), editUser: null, fetchUsers: vi.fn(), filteredUsers: USERS, modal: null,
  openCreateUser: vi.fn(), openEditUser: vi.fn(), resendInvitation: vi.fn(), roleFilter: '', saveUser: vi.fn(), setRoleFilter: vi.fn(),
  setStatusFilter: vi.fn(), setShowArchived: vi.fn(), setUEmail: vi.fn(), setUName: vi.fn(), setURole: vi.fn(), setUStatus: vi.fn(), setUserSearch: vi.fn(),
  showArchived: false, statusFilter: '', uDept: '', setUDept: vi.fn(), uEmail: '', uName: '', uRole: 'student', uSaving: false, uStatus: 'active',
  userSearch: '', users: USERS, usersLoading: false, usersError: null, onlineUsers: new Set(),
  ...extra,
});
const memosCtx = (extra = {}) => ({
  closeModal: vi.fn(), deleteMemo: vi.fn(), editMemo: null, filteredMemos: [], mBody: '', mFrom: '', mSaving: false, mSubj: '', mTo: 'All Faculty',
  memoFilter: '', memoSearch: '', memos: [], fetchMemos: vi.fn(), memosError: '', memosLoading: false, modal: null,
  openCompose: vi.fn(), openEditMemo: vi.fn(), saveMemo: vi.fn(), selMemo: null,
  setMBody: vi.fn(), setMFrom: vi.fn(), setMSubj: vi.fn(), setMTo: vi.fn(), setMemoFilter: vi.fn(), setMemoSearch: vi.fn(),
  setSelMemo: vi.fn(), users: [],
  ...extra,
});
const newsCtx = (extra = {}) => ({
  closeModal: vi.fn(), deleteNewsItem: vi.fn(), editNews: null, filteredNews: [], modal: null,
  nAuthor: '', nCat: 'Academics', nContent: '', nCustomTarget: '', nExpiresDate: '', nImageFile: null, nImageUrl: '', nSaving: false,
  nStatus: 'Draft', nTarget: 'all', nTitle: '', newsReadOnly: false,
  fetchNews: vi.fn(), newsCatF: '', newsError: '', newsItems: [], newsLoading: false, newsSearch: '', newsStatF: '', openEditNews: vi.fn(),
  openNewPost: vi.fn(), saveNews: vi.fn(), saveNewsExpiry: vi.fn(), setNAuthor: vi.fn(), setNCat: vi.fn(), setNContent: vi.fn(), setNExpiresDate: vi.fn(), setNStatus: vi.fn(),
  setNCustomTarget: vi.fn(), setNImageFile: vi.fn(), setNTarget: vi.fn(), setNTitle: vi.fn(), setNewsCatF: vi.fn(), setNewsSearch: vi.fn(), setNewsStatF: vi.fn(),
  updateNewsStatus: vi.fn(async () => true),
  ...extra,
});
const sectionsCtx = (extra = {}) => ({
  schoolYear: '2026-2027', settingsSchoolYear: '2026-2027', schoolYearSource: 'settings',
  teachers: [], sections: [], sectionsLoading: false, sectionsError: null, fetchSections: vi.fn(),
  sectionModal: false, editingSection: null,
  secName: '', setSecName: vi.fn(), secGrade: '', setSecGrade: vi.fn(), secAdviser: '', setSecAdviser: vi.fn(),
  secCapacity: '', setSecCapacity: vi.fn(), secCapacityError: '', setSecCapacityError: vi.fn(),
  secAdviserError: '', setSecAdviserError: vi.fn(), secSaving: false,
  openCreateSection: vi.fn(), openEditSection: vi.fn(), closeSectionModal: vi.fn(), saveSection: vi.fn(), deleteSection: vi.fn(),
  activeSection: null, classList: [], classListLoading: false, classListError: null, unassignedStudents: [], previousMembers: [],
  openClassList: vi.fn(), closeClassList: vi.fn(), addStudentToSection: vi.fn(), removeStudentFromSection: vi.fn(async () => true),
  showToast: vi.fn(), schedules: [], schedulesLoading: false, schedulesError: null, subjects: [], subjectsLoading: false, subjectsError: null,
  setPage: vi.fn(), setScheduleOpenSectionId: vi.fn(),
  ...extra,
});

let matchMedia;
let raf;
beforeEach(() => {
  matchMedia = window.matchMedia;
  raf = window.requestAnimationFrame;
  window.requestAnimationFrame = (cb) => { cb(0); return 0; };
});
afterEach(() => { cleanup(); window.matchMedia = matchMedia; window.requestAnimationFrame = raf; vi.restoreAllMocks(); });
const narrow = (matches) => { window.matchMedia = vi.fn(query => ({ matches: matches && query === '(max-width: 1099.98px)', media: query })); };

describe('V2b Users', () => {
  it('no accounts at all: the sentence, why, and Create the first user', () => {
    h.ctx = usersCtx({ users: [], filteredUsers: [] });
    render(<ClarityAdminUsersTab />);
    const cell = screen.getByText('No users found').closest('td');
    expect(cell.textContent).toContain('Add the first teacher, student or admin.');
    fireEvent.click(within(cell).getByRole('button', { name: 'Create the first user' }));
    expect(h.ctx.openCreateUser).toHaveBeenCalledTimes(1);
  });

  it('a search or filter with no match: a hint, no create button', () => {
    h.ctx = usersCtx({ filteredUsers: [], userSearch: 'zzz' });
    render(<ClarityAdminUsersTab />);
    const cell = screen.getByText('No users found').closest('td');
    expect(cell.textContent).toContain('Try another search, role or status.');
    expect(within(cell).queryByRole('button')).toBeNull();
  });

  it('one-column layout: tapping a name brings the profile into view and focuses the name', () => {
    narrow(true);
    h.ctx = usersCtx();
    const scrolled = [];
    const scroll = vi.fn(function record() { scrolled.push(this); });
    Element.prototype.scrollIntoView = scroll;
    render(<ClarityAdminUsersTab />);
    fireEvent.click(screen.getByRole('button', { name: /Ben Cruz/ }));
    const detail = screen.getByRole('region', { name: 'Selected user' });
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
    expect(scrolled[0]).toBe(detail);
    expect(document.activeElement).toBe(within(detail).getByRole('heading', { level: 2, name: 'Ben Cruz' }));
    delete Element.prototype.scrollIntoView;
  });

  it('two-column layout: the profile is already beside the list, nothing scrolls', () => {
    narrow(false);
    h.ctx = usersCtx();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    render(<ClarityAdminUsersTab />);
    fireEvent.click(screen.getByRole('button', { name: /Ben Cruz/ }));
    expect(scroll).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Selected user' }).textContent).toContain('Ben Cruz');
    delete Element.prototype.scrollIntoView;
  });
});

describe('V2b empty states with a next step', () => {
  it('Memos: none yet -> Write the first memo; filtered -> a hint', () => {
    h.ctx = memosCtx();
    render(<ClarityAdminMemosTab />);
    const box = screen.getByText('No memos found').closest('.x-empty');
    fireEvent.click(within(box).getByRole('button', { name: 'Write the first memo' }));
    expect(h.ctx.openCompose).toHaveBeenCalledTimes(1);
    cleanup();
    h.ctx = memosCtx({ memos: [{ id: 'm1', subject: 'A', created_at: '2026-11-10T03:00:00Z' }] });
    render(<ClarityAdminMemosTab />);
    expect(screen.getByText('No memos found').closest('.x-empty').textContent).toContain('Try another search or recipient.');
  });

  it('News: none yet -> Write the first post; filtered -> a hint', () => {
    h.ctx = newsCtx();
    render(<ClarityAdminNewsTab />);
    const box = screen.getByText('No posts found').closest('.x-empty');
    fireEvent.click(within(box).getByRole('button', { name: 'Write the first post' }));
    expect(h.ctx.openNewPost).toHaveBeenCalledTimes(1);
    cleanup();
    h.ctx = newsCtx({ newsItems: [{ id: 'n1', title: 'A', status: 'Draft', created_at: '2026-11-10T03:00:00Z' }] });
    render(<ClarityAdminNewsTab />);
    expect(screen.getByText('No posts found').closest('.x-empty').textContent).toContain('Try another search, category or status.');
  });

  it('Sections: none for the year -> what a section is and Create the first section', () => {
    h.ctx = sectionsCtx();
    render(<ClarityAdminSectionsTab />);
    const box = screen.getByText('No sections for 2026-2027 yet.').closest('.x-empty');
    expect(box.textContent).toContain('Sections are the class groups, such as 7-Rizal.');
    fireEvent.click(within(box).getByRole('button', { name: 'Create the first section' }));
    expect(h.ctx.openCreateSection).toHaveBeenCalledTimes(1);
  });
});
