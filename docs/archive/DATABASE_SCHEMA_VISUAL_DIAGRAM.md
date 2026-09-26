# 📐 DATABASE SCHEMA VISUAL DIAGRAM

## 🎯 COMPLETE SMARTEDU PORTAL DATABASE MAP

```
═══════════════════════════════════════════════════════════════════
                     SMARTEDU PORTAL DATABASE
                          (23 TABLES)
═══════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION & USERS (2)                    │
├─────────────────────────────────────────────────────────────────┤
│
│  ┌──────────────────────────┐
│  │      PROFILES            │
│  ├──────────────────────────┤
│  │ id (UUID) ─── auth.users│
│  │ email, name             │
│  │ role (enum)             │
│  │ status                  │
│  │ department              │
│  │ photo_url               │
│  │ created_at, updated_at  │
│  └──────────────────────────┘
│              ↓
│  ┌──────────────────────────┐
│  │  NOTIFICATIONS          │
│  ├──────────────────────────┤
│  │ id, user_id → profiles  │
│  │ title, message          │
│  │ is_read, read_at        │
│  │ priority                │
│  └──────────────────────────┘
│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              SCHOOL STRUCTURE & MANAGEMENT (3)                  │
├─────────────────────────────────────────────────────────────────┤
│
│  ┌──────────────────────────┐
│  │  SCHOOL_SETTINGS        │
│  ├──────────────────────────┤
│  │ id = 1 (singleton)      │
│  │ school_name             │
│  │ school_year             │
│  │ current_semester        │
│  │ address, phone, email   │
│  │ website, logo_url       │
│  └──────────────────────────┘
│
│  ┌──────────────────────────┐
│  │      SECTIONS           │ (Grade 10-A, Grade 11-B, etc)
│  ├──────────────────────────┤
│  │ id                      │
│  │ name (unique)           │
│  │ grade_level             │
│  │ adviser_id → profiles   │
│  │ school_year             │
│  │ capacity, current_enrol │
│  └──────────────────────────┘
│          ↓ (one-to-many)
│  ┌──────────────────────────┐
│  │     SCHEDULES           │
│  ├──────────────────────────┤
│  │ id                      │
│  │ section_id              │
│  │ teacher_id → profiles   │
│  │ subject, day, time      │
│  │ room_number             │
│  └──────────────────────────┘
│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              STUDENTS & ENROLLMENT (4)                          │
├─────────────────────────────────────────────────────────────────┤
│
│  ┌──────────────────────────┐
│  │      STUDENTS           │
│  ├──────────────────────────┤
│  │ id → profiles & auth    │
│  │ lrn, student_number     │
│  │ student_status          │
│  │ guardian_name, contact  │
│  │ gwa                     │
│  └──────────────────────────┘
│          ↓ (many-to-many)
│  ┌──────────────────────────┐
│  │  SECTION_STUDENTS       │
│  ├──────────────────────────┤
│  │ id                      │
│  │ section_id              │
│  │ student_id              │
│  │ enrollment_date         │
│  │ status                  │
│  └──────────────────────────┘
│
│  ┌──────────────────────────┐
│  │   PRE_ENROLLMENT        │
│  ├──────────────────────────┤
│  │ id                      │
│  │ student_id              │
│  │ grade_level             │
│  │ school_year             │
│  │ status (Pending, etc)   │
│  │ approved_at, approved_by│
│  └──────────────────────────┘
│
│  ┌──────────────────────────┐
│  │     DOCUMENTS           │
│  ├──────────────────────────┤
│  │ id                      │
│  │ student_id              │
│  │ document_type (TOR,etc) │
│  │ document_url            │
│  │ issued_at, issued_by    │
│  └──────────────────────────┘
│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│            TEACHING MATERIALS & LESSONS (3)                     │
├─────────────────────────────────────────────────────────────────┤
│
│  ┌──────────────────────────┐
│  │   LESSON_PLANS          │ ◄── File uploads here!
│  ├──────────────────────────┤
│  │ id                      │
│  │ teacher_id → profiles   │
│  │ title, subject          │
│  │ objectives, materials   │
│  │ activities              │
│  │ file_url (from storage) │ 🪣 lesson-pdfs bucket
│  │ file_name, file_path    │
│  │ ai_generated            │
│  │ status                  │
│  └──────────────────────────┘
│
│  ┌──────────────────────────┐
│  │    WORKSHEETS           │ ◄── File uploads here!
│  ├──────────────────────────┤
│  │ id                      │
│  │ teacher_id → profiles   │
│  │ title, subject          │
│  │ file_url (from storage) │ 🪣 worksheets bucket
│  │ file_name, file_path    │
│  │ pages, items            │
│  │ status (Draft, etc)     │
│  └──────────────────────────┘
│
│  ┌──────────────────────────┐
│  │ ILAW_LESSON_PLANS       │ ◄── AI-Generated lessons
│  ├──────────────────────────┤
│  │ id                      │
│  │ teacher_id → profiles   │
│  │ title, subject          │
│  │ learning_objectives     │
│  │ ppt_file_url            │ 🪣 ilaw-exports
│  │ pdf_file_url            │
│  │ word_file_url           │
│  │ ai_generated            │
│  └──────────────────────────┘
│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│            ACADEMIC WORK & EVALUATION (7)                       │
├─────────────────────────────────────────────────────────────────┤
│
│  ┌──────────────────────────┐
│  │    ASSIGNMENTS          │ ◄── Teachers create
│  ├──────────────────────────┤
│  │ id                      │
│  │ teacher_id → profiles   │
│  │ section_id → sections   │
│  │ title, instructions     │
│  │ due_date, due_time      │
│  │ total_points            │
│  │ file_url (optional)     │
│  └──────────────────────────┘
│          ↓ (one-to-many)
│  ┌──────────────────────────┐    ┌──────────────────────────┐
│  │ ASSIGNMENT_SUBMISSIONS  │───→ │   Files in Storage       │
│  ├──────────────────────────┤    ├──────────────────────────┤
│  │ id                      │    │ 🪣 assignment-subm...   │
│  │ assignment_id           │    │ {student_id}/{assign..} │
│  │ student_id → profiles   │    └──────────────────────────┘
│  │ submission_text         │
│  │ file_url (from storage) │
│  │ file_name, file_path    │
│  │ grade, grade_value      │
│  │ feedback                │
│  │ graded_at, graded_by    │
│  └──────────────────────────┘
│
│  ┌──────────────────────────┐
│  │      QUIZZES            │ ◄── Teachers create
│  ├──────────────────────────┤
│  │ id                      │
│  │ teacher_id → profiles   │
│  │ section_id → sections   │
│  │ title, subject          │
│  │ total_questions         │
│  │ total_points            │
│  │ is_published            │
│  │ passing_score           │
│  └──────────────────────────┘
│          ↓ (one-to-many)
│  ┌──────────────────────────┐
│  │   QUIZ_RESULTS          │
│  ├──────────────────────────┤
│  │ id                      │
│  │ quiz_id                 │
│  │ student_id → students   │
│  │ points_earned           │
│  │ percentage              │
│  │ is_passed               │
│  │ submitted_at            │
│  └──────────────────────────┘
│
│  ┌──────────────────────────┐
│  │       GRADES            │ ◄── Teachers record
│  ├──────────────────────────┤
│  │ id                      │
│  │ student_id → students   │
│  │ teacher_id → profiles   │
│  │ section_id → sections   │
│  │ subject, school_year    │
│  │ quarter (1-4)           │
│  │ grade (numeric)         │
│  │ grade_letter (A,B,C)    │
│  │ is_passed               │
│  │ remarks                 │
│  └──────────────────────────┘
│
│  ┌──────────────────────────┐
│  │     ATTENDANCE          │ ◄── Teachers record
│  ├──────────────────────────┤
│  │ id                      │
│  │ student_id → students   │
│  │ section_id → sections   │
│  │ date                    │
│  │ subject                 │
│  │ status (Present,Absent) │
│  │ remarks                 │
│  │ recorded_by             │
│  └──────────────────────────┘
│
│  ┌──────────────────────────┐
│  │    ACTIVITY_LOGS        │ ◄── Audit trail
│  ├──────────────────────────┤
│  │ id                      │
│  │ user_id → profiles      │
│  │ action (create/update)  │
│  │ entity_type             │
│  │ entity_id               │
│  │ old_values (JSON)       │
│  │ new_values (JSON)       │
│  │ timestamp               │
│  └──────────────────────────┘
│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│            COMMUNICATIONS (5)                                   │
├─────────────────────────────────────────────────────────────────┤
│
│  ┌──────────────────────────┐
│  │       NEWS              │ (School-wide announcements)
│  ├──────────────────────────┤
│  │ id                      │
│  │ author_id → profiles    │
│  │ title, content          │
│  │ category                │
│  │ status (Published, etc) │
│  │ featured_image_url      │ 🪣 news-images
│  │ published_at            │
│  └──────────────────────────┘
│
│  ┌──────────────────────────┐
│  │   CALENDAR_EVENTS       │
│  ├──────────────────────────┤
│  │ id                      │
│  │ title, description      │
│  │ event_date, time        │
│  │ event_type              │
│  │ location                │
│  │ organizer_id → profiles │
│  │ is_all_day              │
│  └──────────────────────────┘
│
│  ┌──────────────────────────┐
│  │ CLASS_ANNOUNCEMENTS     │ (Per-class messages)
│  ├──────────────────────────┤
│  │ id                      │
│  │ teacher_id → profiles   │
│  │ section_id → sections   │
│  │ title, content          │
│  │ priority                │
│  │ is_pinned               │
│  │ attachment_url          │
│  │ announced_at            │
│  └──────────────────────────┘
│
│  ┌──────────────────────────┐
│  │       MEMOS             │ (Internal messages)
│  ├──────────────────────────┤
│  │ id                      │
│  │ sender_id → profiles    │
│  │ recipient_id → profiles │
│  │ subject, content        │
│  │ priority                │
│  │ status (Draft, Sent)    │
│  │ is_read                 │
│  │ attachment_url          │
│  └──────────────────────────┘
│
│  ┌──────────────────────────┐
│  │   NOTIFICATIONS         │ (See above in section 1)
│  └──────────────────────────┘
│
└─────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════
                        STORAGE BUCKETS (8)
═══════════════════════════════════════════════════════════════════

PUBLIC BUCKETS (Anyone can view):
┌────────────────────────────────────────────────────────────────┐
│ 🪣 lesson-pdfs          → Upload from: lesson_plans.file_url   │
│    Path: {teacher_id}/{timestamp}.pdf                          │
│    Max: 50MB                                                    │
├────────────────────────────────────────────────────────────────┤
│ 🪣 worksheets           → Upload from: worksheets.file_url     │
│    Path: {teacher_id}/{timestamp}.{ext}                        │
│    Max: 50MB (PDF, DOCX, DOC, XLSX)                           │
├────────────────────────────────────────────────────────────────┤
│ 🪣 profile-photos       → Upload from: profiles.photo_url      │
│    Path: {user_id}/{timestamp}.{ext}                           │
│    Max: 10MB (JPG, PNG, WEBP)                                 │
├────────────────────────────────────────────────────────────────┤
│ 🪣 news-images          → Upload from: news.featured_image_url │
│    Path: {author_id}/{timestamp}.{ext}                         │
│    Max: 20MB                                                    │
├────────────────────────────────────────────────────────────────┤
│ 🪣 ilaw-exports         → Upload from: ilaw_lesson_plans       │
│    Path: {teacher_id}/{lesson_id}/{format}_{timestamp}         │
│    Max: 100MB (PPT, PDF, Word)                                │
└────────────────────────────────────────────────────────────────┘

PRIVATE BUCKETS (Restricted access):
┌────────────────────────────────────────────────────────────────┐
│ 🪣 assignment-submissions → assignment_submissions.file_url    │
│    Path: {student_id}/{assignment_id}/{timestamp}              │
│    Max: 50MB (Only student + teacher can access)              │
├────────────────────────────────────────────────────────────────┤
│ 🪣 student-documents    → documents.document_url              │
│    Path: {student_id}/{doc_type}/{timestamp}                   │
│    Max: 25MB (Only student + admin can access)                │
├────────────────────────────────────────────────────────────────┤
│ 🪣 temporary-uploads    → Temporary work files                │
│    Path: {user_id}/{timestamp}.{ext}                           │
│    Max: 100MB (Auto-cleanup after 30 days)                    │
└────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════
                       KEY RELATIONSHIPS
═══════════════════════════════════════════════════════════════════

profiles (1) ──────────→ (N) lesson_plans
           ├──────────→ (N) worksheets
           ├──────────→ (N) assignments
           ├──────────→ (N) quizzes
           ├──────────→ (N) grades
           ├──────────→ (N) attendance
           ├──────────→ (N) news
           ├──────────→ (N) memos
           └──────────→ (N) activity_logs

students (1) ──────────→ (N) section_students
          ├──────────→ (N) grades
          ├──────────→ (N) attendance
          ├──────────→ (N) quiz_results
          ├──────────→ (N) assignment_submissions
          ├──────────→ (N) documents
          └──────────→ (N) pre_enrollment

sections (1) ──────────→ (N) section_students
          ├──────────→ (N) assignments
          ├──────────→ (N) quizzes
          ├──────────→ (N) schedules
          └──────────→ (N) class_announcements

assignments (1) ───────→ (N) assignment_submissions
quizzes (1) ────────────→ (N) quiz_results

═══════════════════════════════════════════════════════════════════
                        DATA FLOW EXAMPLE
═══════════════════════════════════════════════════════════════════

1. TEACHER UPLOADS LESSON PLAN:
   Teacher selects PDF
       ↓
   File goes to 🪣 lesson-pdfs bucket
       ↓
   Public URL returned
       ↓
   lesson_plans record created with file_url
       ↓
   Lesson plan appears in dashboard

2. TEACHER CREATES ASSIGNMENT:
   Teacher fills form (title, due date, etc)
       ↓
   assignment record created in database
       ↓
   Section assigned (has students via section_students)
       ↓
   Students see assignment in their dashboard
       ↓
   Students submit work
       ↓
   Files uploaded to 🪣 assignment-submissions
       ↓
   assignment_submissions records created
       ↓
   Teacher grades submission
       ↓
   grade and feedback saved
       ↓
   Student sees graded work

3. TEACHER RECORDS GRADES:
   Teacher inputs grades for students
       ↓
   grades records created (by subject, quarter)
       ↓
   System calculates GWA
       ↓
   Student views grades on dashboard

═══════════════════════════════════════════════════════════════════
                         SECURITY LAYERS
═══════════════════════════════════════════════════════════════════

✅ Authentication: Via Supabase Auth
✅ RLS Policies: Users see only allowed data
✅ Private Buckets: Restricted file access
✅ Cascading: Delete records clean up relations
✅ Audit Trail: activity_logs table tracks all changes
✅ Constraints: Foreign keys maintain integrity

═══════════════════════════════════════════════════════════════════
```

---

## 📊 STATISTICS

```
Total Tables: 23
Total Columns: 150+
Total Indexes: 50+
Total Triggers: 19
Total RLS Policies: 20+
Total Storage Buckets: 8
Total File Types Supported: 20+
Max Single File Size: 100MB
```

---

## 🎯 QUICK LOOKUP GUIDE

**Need to find a table?**
1. Decide the category (User, Student, Academic, etc)
2. Find in diagram above
3. See relationships with other tables

**Need to see column names?**
→ Use DATABASE_SCHEMA_QUICK_REFERENCE.md

**Need to upload a file?**
→ Check which bucket in the STORAGE section above

**Need relationships?**
→ See KEY RELATIONSHIPS section above

---

**That's your complete database map! Everything is connected and organized!** 🎉
