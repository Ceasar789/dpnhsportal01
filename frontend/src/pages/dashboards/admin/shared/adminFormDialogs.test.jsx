// @vitest-environment jsdom
// U4: the six admin form dialogs on the kit. Labels above fields with
// "Optional" marks, blur validation, input attributes, the busy and
// never-disabled primary, server field errors on their fields, and the
// per-form details (Capacity help, News primary label, both time boxes).
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));

const { default: SubjectFormDialog } = await import('./SubjectFormDialog');
const { default: SectionFormDialog } = await import('./SectionFormDialog');
const { default: MemoFormDialog } = await import('./MemoFormDialog');
const { default: EventFormDialog } = await import('./EventFormDialog');
const { default: NewsFormDialog } = await import('./NewsFormDialog');
const { default: ScheduleFormDialog } = await import('./ScheduleFormDialog');

beforeEach(() => { h.ctx = {}; });
afterEach(cleanup);

const dialog = () => screen.getByRole('dialog');
const press = name => fireEvent.click(within(dialog()).getByRole('button', { name }));
const blurAfterTyping = (label, value) => {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
  return input;
};

describe('Subject', () => {
  const open = extra => {
    h.ctx = { subjectModal: 'create', sName: '', sCode: '', sActive: true, setSName: vi.fn(), setSCode: vi.fn(), setSActive: vi.fn(),
      closeSubjectModal: vi.fn(), saveSubject: vi.fn(async () => ({ ok: true })), ...extra };
    return render(<SubjectFormDialog />);
  };

  it('renders nothing when closed', () => {
    h.ctx = { subjectModal: null };
    const { container } = render(<SubjectFormDialog />);
    expect(container.innerHTML).toBe('');
  });

  it('labels, limits and attributes', () => {
    open();
    expect(dialog().getAttribute('aria-labelledby')).toBeTruthy();
    expect(screen.getByLabelText('Subject name').maxLength).toBe(100);
    const code = screen.getByLabelText('Code');
    expect(code.maxLength).toBe(20);
    expect(code.getAttribute('autocapitalize')).toBe('characters');
    expect(code.getAttribute('aria-required')).toBe('true');
    expect(within(dialog()).getByRole('button', { name: 'Add subject' })).toBeTruthy();
  });

  it('a field changed then left empty says so on blur; tabbing past it untouched stays quiet', () => {
    open();
    fireEvent.blur(screen.getByLabelText('Code'));
    expect(screen.queryByText('Enter a short code, like MATH.')).toBeNull();
    blurAfterTyping('Subject name', '   ');
    expect(screen.getByText('Enter the subject name.')).toBeTruthy();
  });

  it('a duplicate code from the server lands on Code, and edit says Save changes', async () => {
    open({ editingSubject: { id: 's' }, sName: 'Math', sCode: 'MATH',
      saveSubject: vi.fn(async () => ({ ok: false, fieldErrors: [{ fieldId: 'subjects-code', message: 'Another subject already uses this code.' }] })) });
    await act(async () => { press('Save changes'); });
    expect(screen.getByLabelText('Code').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText('Code'));
  });
});

describe('Section', () => {
  const T = [{ id: 'a', name: 'Ana', role: 'teacher', status: 'active' }];
  const open = extra => {
    h.ctx = { sectionModal: 'create', teachers: T, sections: [], secName: '', secGrade: '', secAdviser: '', secCapacity: '',
      setSecName: vi.fn(), setSecGrade: vi.fn(), setSecAdviser: vi.fn(), setSecCapacity: vi.fn(), setSecCapacityError: vi.fn(),
      setSecAdviserError: vi.fn(), closeSectionModal: vi.fn(), saveSection: vi.fn(async () => true), ...extra };
    return render(<SectionFormDialog />);
  };

  it('the Capacity hint is the kit help text (the old unstyled .field-help is gone); numeric keypad', () => {
    open();
    const capacity = screen.getByLabelText('Capacity');
    const help = document.getElementById(`${capacity.id}-help`);
    expect(help.className).toBe('fk-help');
    expect(help.textContent).toBe('A whole number from 1 to 60.');
    expect(capacity.getAttribute('aria-describedby')).toContain(help.id);
    expect(capacity.getAttribute('inputmode')).toBe('numeric');
    expect(document.querySelector('.field-help')).toBeNull();
  });

  it('Adviser is marked Optional; Grade offers Grade 7-10 only', () => {
    open();
    expect(screen.getByText('Optional', { selector: 'label[for="sections-adviser"] .fk-optional' })).toBeTruthy();
    const grades = within(screen.getByLabelText('Grade level')).getAllByRole('option').map(o => o.value).filter(Boolean);
    expect(grades).toEqual(['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']);
  });

  it("the hook's own capacity and adviser answers show on their fields, once", () => {
    open({ secCapacityError: 'Capacity cannot be lower than the current enrollment of 35.', secAdviserError: 'Choose an active teacher as the section adviser.' });
    expect(screen.getAllByText(/current enrollment of 35/)).toHaveLength(1);
    expect(screen.getByLabelText('Capacity').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText(/^Adviser/).getAttribute('aria-invalid')).toBe('true');
  });

  it('a duplicate name from the server lands on the Name field', async () => {
    open({ secName: '7-Rizal', secGrade: 'Grade 7', secCapacity: '40',
      saveSection: vi.fn(async () => ({ ok: false, fieldErrors: [{ fieldId: 'sections-section-name', message: 'A section named "7-Rizal" already exists for 2026-2027.' }] })) });
    await act(async () => { press('Add section'); });
    expect(document.activeElement).toBe(screen.getByLabelText('Section name'));
  });
});

describe('Memo', () => {
  it('Subject required with a 255 cap; From office and Message optional; nothing saved on an empty subject', () => {
    h.ctx = { modal: 'memo', users: [], mTo: 'All Faculty', setMSubj: vi.fn(), setMFrom: vi.fn(), setMTo: vi.fn(), setMBody: vi.fn(),
      closeModal: vi.fn(), saveMemo: vi.fn() };
    render(<MemoFormDialog />);
    expect(screen.getByLabelText('Subject').maxLength).toBe(255);
    expect(screen.getByLabelText(/^From office/).getAttribute('aria-required')).toBeNull();
    expect(screen.getByLabelText(/^Message/).tagName).toBe('TEXTAREA');
    press('Send memo');
    expect(h.ctx.saveMemo).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText('Subject'));
  });
});

describe('Event', () => {
  const open = extra => {
    h.ctx = { modal: 'event', evTitle: 'Fair', evDate: '2026-11-12', evEnd: '', evType: 'Event', setEvTitle: vi.fn(), setEvDate: vi.fn(),
      setEvEnd: vi.fn(), setEvType: vi.fn(), setEvCustomType: vi.fn(), setEvDesc: vi.fn(), closeModal: vi.fn(),
      saveEvent: vi.fn(), deleteEvent: vi.fn(), ...extra };
    return render(<EventFormDialog />);
  };

  it('dates are date inputs; End date cannot be picked before the start', () => {
    open();
    expect(screen.getByLabelText('Start date').type).toBe('date');
    expect(screen.getByLabelText(/^End date/).min).toBe('2026-11-12');
  });

  it('Custom Type asks for the custom name; Delete is offered only when editing', () => {
    open({ evType: 'Custom Type', evCustomType: '' });
    press('Add event');
    expect(screen.getAllByText('Enter the custom event type.').length).toBeGreaterThan(0);
    expect(h.ctx.saveEvent).not.toHaveBeenCalled();
    expect(within(dialog()).queryByRole('button', { name: 'Delete' })).toBeNull();
    cleanup();
    open({ editEvent: { id: 'e1' } });
    press('Delete');
    expect(h.ctx.deleteEvent).toHaveBeenCalledWith('e1');
  });
});

describe('News', () => {
  const open = extra => {
    h.ctx = { modal: 'news', nTitle: '', nCat: 'Events', nTarget: 'all', nStatus: 'Draft', newsReadOnly: false,
      setNTitle: vi.fn(), setNCat: vi.fn(), setNTarget: vi.fn(), setNCustomTarget: vi.fn(), setNAuthor: vi.fn(), setNContent: vi.fn(),
      setNImageFile: vi.fn(), setNStatus: vi.fn(), setNExpiresDate: vi.fn(), closeModal: vi.fn(), saveNews: vi.fn(), saveNewsExpiry: vi.fn(), ...extra };
    return render(<NewsFormDialog />);
  };

  it('the primary follows Status: Save draft for a draft, Publish for a published post', () => {
    open();
    expect(within(dialog()).getByRole('button', { name: 'Save draft' })).toBeTruthy();
    cleanup();
    open({ nStatus: 'Published' });
    expect(within(dialog()).getByRole('button', { name: 'Publish' })).toBeTruthy();
  });

  it('"Title required" and "Custom audience required" are field messages now, not toasts', () => {
    open({ nTarget: 'custom', nCustomTarget: '' });
    press('Save draft');
    expect(h.ctx.saveNews).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Title').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Custom audience').getAttribute('aria-invalid')).toBe('true');
  });

  it('read-only: content locked, expiry editable, Save expiry calls saveNewsExpiry', () => {
    open({ newsReadOnly: true, editNews: { id: 'n1' }, nTitle: 'Old', nStatus: 'Published' });
    expect(screen.getByLabelText(/^Title/).disabled).toBe(true);
    expect(screen.getByLabelText(/^Expires on/).disabled).toBe(false);
    press('Save expiry');
    expect(h.ctx.saveNewsExpiry).toHaveBeenCalledTimes(1);
  });
});

describe('Schedule', () => {
  const ANA = { id: 'ana', name: 'Ana' };
  const open = (extra, props = {}) => {
    h.ctx = { scheduleModal: 'create', schedTeacher: '', schedDay: 'Monday', schedStart: '08:00', schedEnd: '09:00', schedRoom: '',
      setSchedTeacher: vi.fn(), setSchedDay: vi.fn(), setSchedStart: vi.fn(), setSchedEnd: vi.fn(), setSchedRoom: vi.fn(),
      closeScheduleModal: vi.fn(), saveSchedule: vi.fn(), ...extra };
    return render(<ScheduleFormDialog title="Science — 7-Rizal" grade="Grade 7" eligibleTeachers={[ANA]}
      eligibilityLoading={false} eligibilityError={false} onRetryEligibility={vi.fn()} {...props} />);
  };

  it('end before start marks BOTH time boxes and points both to the one message (decision 3)', () => {
    open({ schedTeacher: 'ana', schedStart: '10:00', schedEnd: '09:00' });
    press('Add period');
    for (const label of ['Start', 'End']) {
      const input = screen.getByLabelText(label);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe('schedules-time-error');
    }
    expect(document.getElementById('schedules-time-error').textContent).toBe('The end time must be after the start time.');
    expect(document.activeElement).toBe(screen.getByLabelText('End'));
    expect(h.ctx.saveSchedule).not.toHaveBeenCalled();
  });

  it('with no eligible teacher the field explains why and Add does not repeat it', () => {
    open({}, { eligibleTeachers: [] });
    expect(screen.getByText('Assign someone this subject for Grade 7 in Teaching Load first.')).toBeTruthy();
    press('Add period');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Choose a teacher.')).toBeNull();
    expect(h.ctx.saveSchedule).not.toHaveBeenCalled();
  });
});
