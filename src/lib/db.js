// ============================================
// FILE: src/lib/db.js
// PURPOSE: All Supabase database operations
// ============================================
import { supabase } from '../config/supabase';

// PROFILES
export const getProfile          = (id)     => supabase.from('profiles').select('*').eq('id', id).single();
export const getAllProfiles       = ()       => supabase.from('profiles').select('*').order('name');
export const getProfilesByRole   = (role)   => supabase.from('profiles').select('*').eq('role', role).order('name');
export const updateProfile       = (id, d)  => supabase.from('profiles').update(d).eq('id', id);
export const createProfile       = (data)   => supabase.from('profiles').insert(data).select().single();
export const deleteProfile       = (id)     => supabase.from('profiles').delete().eq('id', id);

// NEWS
export const getPublishedNews    = ()       => supabase.from('news').select('*').eq('status', 'Published').order('published_at', { ascending: false });
export const getAllNews           = ()       => supabase.from('news').select('*').order('created_at', { ascending: false });
export const createNews          = (d)      => supabase.from('news').insert(d).select().single();
export const updateNews          = (id, d)  => supabase.from('news').update(d).eq('id', id);
export const deleteNews          = (id)     => supabase.from('news').delete().eq('id', id);

// CALENDAR EVENTS
export const getCalendarEvents       = ()         => supabase.from('calendar_events').select('*').order('event_date');
export const createCalendarEvent     = (d)        => supabase.from('calendar_events').insert(d).select().single();
export const updateCalendarEvent     = (id, d)    => supabase.from('calendar_events').update(d).eq('id', id);
export const deleteCalendarEvent     = (id)       => supabase.from('calendar_events').delete().eq('id', id);

// MEMOS
export const getSentMemos            = ()         => supabase.from('memos').select('*').eq('status', 'Sent').order('sent_at', { ascending: false });
export const getAllMemos              = ()         => supabase.from('memos').select('*').order('created_at', { ascending: false });
export const createMemo              = (d)        => supabase.from('memos').insert(d).select().single();
export const updateMemo              = (id, d)    => supabase.from('memos').update(d).eq('id', id);
export const deleteMemo              = (id)       => supabase.from('memos').delete().eq('id', id);

// SECTIONS
export const getSections             = ()         => supabase.from('sections').select('*, profiles!adviser_id(name)').order('name');
export const getSectionById          = (id)       => supabase.from('sections').select('*').eq('id', id).single();
export const createSection           = (d)        => supabase.from('sections').insert(d).select().single();
export const updateSection           = (id, d)    => supabase.from('sections').update(d).eq('id', id);
export const deleteSection           = (id)       => supabase.from('sections').delete().eq('id', id);

// STUDENTS
export const getStudents             = ()         => supabase.from('students').select('*, profiles(name, email, status, photo_url)');
export const getStudentById          = (id)       => supabase.from('students').select('*, profiles(*)').eq('id', id).single();
export const getStudentsBySection    = (secId)    => supabase.from('section_students').select('*, profiles(name, email)').eq('section_id', secId);
export const updateStudent           = (id, d)    => supabase.from('students').update(d).eq('id', id);

// GRADES
export const getGradesByStudent      = (sid)      => supabase.from('grades').select('*').eq('student_id', sid).order('quarter');
export const getGradesBySection      = (secId)    => supabase.from('grades').select('*, profiles!student_id(name)').eq('section_id', secId);
export const upsertGrade             = (d)        => supabase.from('grades').upsert(d, { onConflict: 'student_id,section_id,subject,quarter,school_year' }).select().single();

// ATTENDANCE
export const getAttendanceBySection  = (secId, date) => supabase.from('attendance').select('*, profiles!student_id(name)').eq('section_id', secId).eq('date', date);
export const getAttendanceByStudent  = (sid)      => supabase.from('attendance').select('*').eq('student_id', sid).order('date', { ascending: false });
export const upsertAttendance        = (d)        => supabase.from('attendance').upsert(d, { onConflict: 'student_id,section_id,date,subject' }).select();

// ASSIGNMENTS
export const getAssignmentsByTeacher = (tid)      => supabase.from('assignments').select('*').eq('teacher_id', tid).order('created_at', { ascending: false });
export const getAssignmentsBySection = (sid)      => supabase.from('assignments').select('*').eq('section_id', sid).order('due_date');
export const createAssignment        = (d)        => supabase.from('assignments').insert(d).select().single();
export const updateAssignment        = (id, d)    => supabase.from('assignments').update(d).eq('id', id);
export const deleteAssignment        = (id)       => supabase.from('assignments').delete().eq('id', id);
export const getSubmissions          = (aid)      => supabase.from('assignment_submissions').select('*, profiles!student_id(name)').eq('assignment_id', aid);
export const upsertSubmission        = (d)        => supabase.from('assignment_submissions').upsert(d, { onConflict: 'assignment_id,student_id' }).select();

// QUIZZES
export const getQuizzesByTeacher     = (tid)      => supabase.from('quizzes').select('*').eq('teacher_id', tid).order('created_at', { ascending: false });
export const getQuizzesBySection     = (sid)      => supabase.from('quizzes').select('*').eq('section_id', sid).order('due_date');
export const createQuiz              = (d)        => supabase.from('quizzes').insert(d).select().single();
export const updateQuiz              = (id, d)    => supabase.from('quizzes').update(d).eq('id', id);
export const deleteQuiz              = (id)       => supabase.from('quizzes').delete().eq('id', id);
export const getQuizResults          = (qid)      => supabase.from('quiz_results').select('*, profiles!student_id(name)').eq('quiz_id', qid);

// LESSON PLANS
export const getLessonPlansByTeacher = (tid)      => supabase.from('lesson_plans').select('*').eq('teacher_id', tid).order('created_at', { ascending: false });
export const createLessonPlan        = (d)        => supabase.from('lesson_plans').insert(d).select().single();
export const updateLessonPlan        = (id, d)    => supabase.from('lesson_plans').update(d).eq('id', id);
export const deleteLessonPlan        = (id)       => supabase.from('lesson_plans').delete().eq('id', id);

// WORKSHEETS
export const getWorksheetsByTeacher  = (tid)      => supabase.from('worksheets').select('*').eq('teacher_id', tid).order('created_at', { ascending: false });
export const createWorksheet         = (d)        => supabase.from('worksheets').insert(d).select().single();
export const updateWorksheet         = (id, d)    => supabase.from('worksheets').update(d).eq('id', id);
export const deleteWorksheet         = (id)       => supabase.from('worksheets').delete().eq('id', id);

// CLASS ANNOUNCEMENTS
export const getAnnouncementsByTeacher = (tid)    => supabase.from('class_announcements').select('*').eq('teacher_id', tid).order('created_at', { ascending: false });
export const getAnnouncementsBySection = (sid)    => supabase.from('class_announcements').select('*, profiles!teacher_id(name)').eq('section_id', sid).order('created_at', { ascending: false });
export const createAnnouncement        = (d)      => supabase.from('class_announcements').insert(d).select().single();
export const deleteAnnouncement        = (id)     => supabase.from('class_announcements').delete().eq('id', id);

// PRE-ENROLLMENT
export const getPreEnrollments         = ()       => supabase.from('pre_enrollment').select('*').order('submitted_at', { ascending: false });
export const getPreEnrollmentByStudent = (sid)    => supabase.from('pre_enrollment').select('*').eq('student_id', sid).single();
export const createPreEnrollment       = (d)      => supabase.from('pre_enrollment').insert(d).select().single();
export const updatePreEnrollment       = (id, d)  => supabase.from('pre_enrollment').update(d).eq('id', id);

// SCHEDULES
export const getSchedulesBySection   = (sid)      => supabase.from('schedules').select('*, profiles!teacher_id(name)').eq('section_id', sid).order('day_of_week');
export const getAllSchedules          = ()         => supabase.from('schedules').select('*, sections(name), profiles!teacher_id(name)').order('section_id');
export const createSchedule          = (d)        => supabase.from('schedules').insert(d).select().single();
export const updateSchedule          = (id, d)    => supabase.from('schedules').update(d).eq('id', id);
export const deleteSchedule          = (id)       => supabase.from('schedules').delete().eq('id', id);

// DOCUMENTS
export const getDocumentsByStudent   = (sid)      => supabase.from('documents').select('*').eq('student_id', sid).order('issued_at', { ascending: false });
export const getAllDocuments          = ()         => supabase.from('documents').select('*, profiles!student_id(name)').order('issued_at', { ascending: false });
export const createDocument          = (d)        => supabase.from('documents').insert(d).select().single();
export const updateDocument          = (id, d)    => supabase.from('documents').update(d).eq('id', id);

// SCHOOL SETTINGS
export const getSchoolSettings       = ()         => supabase.from('school_settings').select('*').single();
export const updateSchoolSettings    = (d)        => supabase.from('school_settings').update(d).eq('id', 1);

// ACTIVITY LOG
export const logActivity = (userId, action, entityType = null, entityId = null, details = null) =>
  supabase.from('activity_logs').insert({ user_id: userId, action, entity_type: entityType, entity_id: entityId, details });
export const getActivityLogs = (limit = 100) =>
  supabase.from('activity_logs').select('*, profiles!user_id(name, role)').order('created_at', { ascending: false }).limit(limit);