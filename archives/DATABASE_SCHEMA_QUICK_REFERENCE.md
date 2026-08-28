# 🎯 NEW DATABASE - QUICK REFERENCE GUIDE

## 📋 FILES PROVIDED

### Database & Storage Files:

| File | Purpose | Action |
|------|---------|--------|
| `COMPLETE_DATABASE_SCHEMA_v2.sql` | Complete database with 23 tables | Run in SQL Editor |
| `STORAGE_BUCKETS_CONFIGURATION.sql` | All 8 storage buckets setup | Run in SQL Editor |
| `NEW_DATABASE_COMPLETE_SETUP_GUIDE.md` | Step-by-step setup instructions | Read & follow |
| `DATABASE_SCHEMA_QUICK_REFERENCE.md` | This file - Quick lookup | Reference |

---

## 🗄️ DATABASE STRUCTURE (23 TABLES)

### User Management (2 tables)
```
profiles          - User accounts (teachers, students, admins)
notifications     - User notifications
```

### School Structure (3 tables)
```
school_settings   - System configuration
sections          - Class sections/batches
schedules         - Class timetables
```

### Student Management (4 tables)
```
students          - Student records
section_students  - Student enrollment in sections
pre_enrollment    - Pre-enrollment requests
documents         - Official documents (TOR, Diploma, etc)
```

### Teaching Materials (3 tables)
```
lesson_plans      - Teacher lesson plans
worksheets        - Educational worksheets
ilaw_lesson_plans - ILAW generated lesson plans
```

### Academic Work (7 tables)
```
assignments       - Teacher assignments
assignment_submissions - Student submissions
quizzes          - Quiz/test management
quiz_results     - Student quiz responses
grades           - Student grades by subject
attendance       - Daily attendance records
activity_logs    - Audit trail
```

### Communications (5 tables)
```
news             - School announcements
calendar_events  - School calendar events
class_announcements - Class-specific announcements
memos            - Internal messages
```

---

## 🪣 STORAGE BUCKETS (8 BUCKETS)

### Public Buckets (Anyone can view)
```
lesson-pdfs      - Lesson plan PDFs (50MB max)
worksheets       - Worksheet files (50MB max)
profile-photos   - User avatars (10MB max)
news-images      - News pictures (20MB max)
ilaw-exports     - Exported lesson plans (100MB max)
```

### Private Buckets (Restricted access)
```
assignment-submissions - Student work (50MB max)
student-documents      - Official docs (25MB max)
temporary-uploads      - Work-in-progress (100MB max)
```

---

## 📊 TABLE COLUMNS SUMMARY

### profiles
```
id (UUID)          - User ID from Auth
email              - Email address
name               - Full name
role               - main_admin, admin, teacher, student, etc
department         - Department/Office
status             - active, inactive, suspended
photo_url          - Profile photo URL
phone              - Contact number
date_of_birth      - DOB
address            - Address
created_at         - Timestamp
updated_at         - Timestamp
```

### lesson_plans
```
id (UUID)          - Lesson plan ID
teacher_id (UUID)  - Teacher who created it
title              - Lesson title
subject            - Subject area
grade_level        - Grade level
duration           - Duration (e.g., "60 minutes")
strategy           - Teaching strategy
objectives         - Learning objectives (text)
materials          - Required materials
activities         - Activities to perform
assessment_methods - Assessment methods
file_url           - PDF file URL
file_name          - PDF file name
file_path          - Storage path
ai_generated       - TRUE if from PDF upload
status             - draft, published, archived
created_at         - Timestamp
updated_at         - Timestamp
```

### worksheets
```
id (UUID)          - Worksheet ID
teacher_id (UUID)  - Teacher who created it
title              - Worksheet title
subject            - Subject area
grade_level        - Grade level
file_url           - File URL
file_name          - File name
file_path          - Storage path
pages              - Number of pages
items              - Number of items/questions
status             - Draft, Distributed, Archived
created_at         - Timestamp
updated_at         - Timestamp
```

### assignments
```
id (UUID)          - Assignment ID
teacher_id (UUID)  - Teacher who created it
section_id (UUID)  - Section assigned to
title              - Assignment title
description        - Details
subject            - Subject
instructions       - Instructions text
due_date           - Due date
due_time           - Due time
total_points       - Points possible (default 100)
file_url           - Attachment file URL
file_name          - Attachment file name
status             - active, closed, archived
created_at         - Timestamp
updated_at         - Timestamp
```

### assignment_submissions
```
id (UUID)          - Submission ID
assignment_id (UUID) - Which assignment
student_id (UUID)  - Which student
submission_text    - Text submission
file_url           - File submission URL
file_name          - File name
submitted_at       - When submitted
is_late            - TRUE if late
grade              - Letter grade (A, B, C, etc)
grade_value        - Numeric grade (95, 85, etc)
points_earned      - Points given
feedback           - Teacher comments
graded_at          - When graded
graded_by          - Who graded it
created_at         - Timestamp
updated_at         - Timestamp
```

### grades
```
id (UUID)          - Grade ID
student_id (UUID)  - Student
teacher_id (UUID)  - Teacher who recorded
section_id (UUID)  - Section
subject            - Subject name
school_year        - School year (e.g., 2025-2026)
quarter            - Quarter (1-4)
grade              - Numeric grade
grade_letter       - Letter grade (A, B, C, etc)
remarks            - Comments
is_passed          - TRUE if passing
recorded_by        - Who recorded it
created_at         - Timestamp
updated_at         - Timestamp
```

### attendance
```
id (UUID)          - Attendance record ID
student_id (UUID)  - Student
section_id (UUID)  - Section
date               - Attendance date
subject            - Subject (if applicable)
status             - Present, Absent, Late, Excused, Illness
remarks            - Notes
recorded_by        - Who recorded it
created_at         - Timestamp
updated_at         - Timestamp
```

### quizzes
```
id (UUID)          - Quiz ID
teacher_id (UUID)  - Teacher who created it
section_id (UUID)  - Section it's for
title              - Quiz title
description        - Description
subject            - Subject
due_date           - Due date
due_time           - Due time
total_questions    - Number of questions
total_points       - Points possible
time_limit_minutes - Time limit in minutes
passing_score      - Passing score
is_published       - TRUE if available
allow_retake       - TRUE if students can retake
created_at         - Timestamp
updated_at         - Timestamp
```

### quiz_results
```
id (UUID)          - Result ID
quiz_id (UUID)     - Which quiz
student_id (UUID)  - Which student
points_earned      - Points earned
percentage         - Percentage score
time_spent_minutes - Time taken
submitted_at       - When submitted
graded_at          - When graded
is_passed          - TRUE if passing score
feedback           - Teacher feedback
created_at         - Timestamp
updated_at         - Timestamp
```

---

## 🔑 KEY RELATIONSHIPS

```
profiles (main user table)
  └── lesson_plans (one teacher → many lessons)
  └── worksheets (one teacher → many worksheets)
  └── assignments (one teacher → many assignments)
  └── grades (one teacher → many grade records)
  └── quizzes (one teacher → many quizzes)
  └── class_announcements (one teacher → many announcements)
  └── news (one author → many articles)
  └── memos (one sender → many memos)

students (extends profiles)
  └── section_students (student → sections)
      └── sections (many students per section)
  └── grades (one student → many grades)
  └── attendance (one student → many records)
  └── assignment_submissions (one student → many submissions)
  └── quiz_results (one student → many results)
  └── documents (one student → many documents)

assignments
  └── assignment_submissions (one assignment → many submissions)
  └── sections (assigned to section)

quizzes
  └── quiz_results (one quiz → many results)
  └── sections (quiz for section)
```

---

## ⚡ QUICK SQL COMMANDS

### Get all lesson plans for a teacher
```sql
SELECT * FROM lesson_plans 
WHERE teacher_id = 'teacher-uuid'
ORDER BY created_at DESC;
```

### Get student's grades and GWA
```sql
SELECT 
  subject, 
  grade, 
  grade_letter,
  AVG(grade) OVER () as gwa
FROM grades 
WHERE student_id = 'student-uuid'
ORDER BY subject;
```

### Get assignment submissions
```sql
SELECT 
  s.id as student_id,
  p.name as student_name,
  asub.submitted_at,
  asub.grade,
  asub.feedback
FROM assignment_submissions asub
JOIN profiles p ON asub.student_id = p.id
WHERE asub.assignment_id = 'assignment-uuid'
ORDER BY asub.submitted_at;
```

### Get student's attendance summary
```sql
SELECT 
  DATE_TRUNC('month', date) as month,
  status,
  COUNT(*) as count
FROM attendance
WHERE student_id = 'student-uuid'
GROUP BY DATE_TRUNC('month', date), status;
```

---

## 📈 INDEX PERFORMANCE

Total indexes created: **50+**

Key indexes for speed:
```
- idx_profiles_role (for role-based filtering)
- idx_lesson_plans_teacher (for teacher's lessons)
- idx_assignments_due_date (for date-based queries)
- idx_grades_student (for student grades)
- idx_attendance_date (for attendance records)
- idx_activity_logs_created_at (for audit trail)
- idx_news_published_at (for latest news)
```

---

## 🔐 SECURITY - RLS POLICIES

Enabled policies:
- ✅ Users see only their own profile
- ✅ Admins see all data
- ✅ Teachers see own lesson plans/assignments
- ✅ Students see own grades/submissions
- ✅ Attendance visible to section adviser
- ✅ News visible per status (published/draft)

---

## 🧠 MATERIALIZED VIEWS

Two views created for analytics:

### student_grades_summary
```
Returns: student_id, name, gwa, subjects_taken, passed, failed
Use: Quick student performance overview
```

### teacher_workload
```
Returns: teacher_id, name, assignment_count, quiz_count, lesson_count
Use: Teacher workload analysis
```

---

## 📝 AUTOMATIC FEATURES

✅ Created_at - Auto timestamp on insert
✅ Updated_at - Auto timestamp on updates (via trigger)
✅ Unique constraints - Prevent duplicates
✅ Foreign keys - Maintain relationships
✅ Cascading deletes - Clean up related records
✅ Check constraints - Validate data

---

## 🚀 SETUP CHECKLIST

- [ ] Run COMPLETE_DATABASE_SCHEMA_v2.sql
- [ ] Verify 23 tables created
- [ ] Run STORAGE_BUCKETS_CONFIGURATION.sql
- [ ] Verify 8 buckets created
- [ ] Update .env file with credentials
- [ ] Test database connection
- [ ] Test file uploads
- [ ] Create first admin user
- [ ] Run test queries
- [ ] Verify RLS policies work

---

## 💾 DEFAULT DATA

After running the schema, you'll have:

```
school_settings table:
- School name: Dr. Paulino Ng National High School
- School year: 2025-2026
- Current semester: 1
- Address, phone, email, website (editable)
```

---

## 🎓 EXAMPLE DATA STRUCTURE

### A complete lesson plan record:
```json
{
  "id": "uuid",
  "teacher_id": "uuid",
  "title": "Introduction to Photosynthesis",
  "subject": "Science",
  "grade_level": "Grade 10",
  "duration": "60 minutes",
  "strategy": "Cooperative Learning",
  "objectives": "Students will understand photosynthesis process\nStudents will identify key organelles",
  "materials": "Diagrams, worksheets, microscopes",
  "activities": "Lab work, group discussion",
  "assessment_methods": "Quiz, practical exam",
  "file_url": "https://...supabase.co/storage/v1/object/public/lesson-pdfs/uuid/1234567890_abc.pdf",
  "file_name": "Photosynthesis.pdf",
  "file_path": "uuid/1234567890_abc.pdf",
  "ai_generated": true,
  "status": "published",
  "created_at": "2026-06-20T10:30:00Z",
  "updated_at": "2026-06-20T14:45:00Z"
}
```

---

## 📞 SUPPORT REFERENCES

### Supabase Documentation
- Tables & Relationships: https://supabase.com/docs/guides/database
- RLS Policies: https://supabase.com/docs/guides/auth/row-level-security
- Storage: https://supabase.com/docs/guides/storage
- Real-time: https://supabase.com/docs/guides/realtime

### Files in This Project
- Database creation: `COMPLETE_DATABASE_SCHEMA_v2.sql`
- Storage setup: `STORAGE_BUCKETS_CONFIGURATION.sql`
- Full guide: `NEW_DATABASE_COMPLETE_SETUP_GUIDE.md`
- Checklist: `UPLOAD_FIX_CHECKLIST.md`

---

## ✅ YOU'RE READY!

Your new database is:
- ✅ Complete (23 tables)
- ✅ Organized (clear relationships)
- ✅ Secure (RLS policies)
- ✅ Fast (50+ indexes)
- ✅ Production-ready
- ✅ No longer messy!

Happy coding! 🚀
