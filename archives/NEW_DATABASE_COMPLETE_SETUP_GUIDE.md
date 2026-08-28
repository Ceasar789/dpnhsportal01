# 🎯 COMPLETE NEW DATABASE SETUP GUIDE

## 📋 TABLE OF CONTENTS
1. Database Overview
2. Setup Instructions
3. Storage Bucket Setup
4. Verification Checklist
5. Troubleshooting

---

## 📊 DATABASE OVERVIEW

### What's Included:
- **23 Complete Tables** - All data structures
- **50+ Indexes** - For performance optimization
- **RLS Policies** - Security and data isolation
- **Automatic Timestamps** - created_at & updated_at
- **Materialized Views** - For analytics
- **8 Storage Buckets** - For file management

### Total Setup Time: ~15 minutes

---

## 🚀 SETUP INSTRUCTIONS

### STEP 1: Create Fresh Supabase Project (if needed)

1. Go to https://supabase.com
2. Click "Create a new project"
3. Select your organization
4. Enter project name: `SmartEdu_Portal` or your preference
5. Choose database password (strong!)
6. Select region closest to you (e.g., Tokyo/Asia)
7. Click "Create new project"
8. Wait for database to initialize (~5 minutes)

---

### STEP 2: Run Complete Database Schema

1. **In Supabase Dashboard:**
   - Click **"SQL Editor"** in left sidebar
   - Click **"Create a new query"**

2. **Copy the entire content from:**
   - File: `COMPLETE_DATABASE_SCHEMA_v2.sql`
   - Location: Your project root

3. **Paste into SQL Editor** and click **"RUN"**

4. **Wait for completion** - You'll see:
   ```
   ✅ Query executed successfully
   ```

5. **Verify tables created:**
   - Go to **"Table Editor"** sidebar
   - You should see all 23 tables listed:
     - profiles
     - lesson_plans
     - worksheets
     - assignments
     - grades
     - attendance
     - quizzes
     - ... and 16 more

---

### STEP 3: Create Storage Buckets

**Option A: Using SQL (Recommended)**

1. Go to **"SQL Editor"**
2. Click **"Create a new query"**
3. Copy content from: `STORAGE_BUCKETS_CONFIGURATION.sql`
4. Paste and click **"RUN"**
5. Wait for all buckets to be created

**Option B: Manual Bucket Creation (If SQL fails)**

Repeat this for each bucket:

1. Go to **"Storage"** in sidebar
2. Click **"Create a new bucket"**
3. Enter bucket name from list below:
   - ✓ `lesson-pdfs`
   - ✓ `worksheets`
   - ✓ `assignment-submissions`
   - ✓ `student-documents`
   - ✓ `profile-photos`
   - ✓ `news-images`
   - ✓ `ilaw-exports`
   - ✓ `temporary-uploads`

4. For each bucket:
   - Check **"Public bucket"** if listed below as public
   - Click **"Create bucket"**
   - Go to bucket → **⋮** menu → **Policies**
   - Add policies as shown in the configuration file

**Bucket Access Levels:**
```
PUBLIC buckets:
- lesson-pdfs
- worksheets
- profile-photos
- news-images
- ilaw-exports

PRIVATE buckets:
- assignment-submissions
- student-documents
- temporary-uploads
```

---

### STEP 4: Enable RLS (Row Level Security)

RLS should be automatically enabled by the schema script, but verify:

1. Go to **"Authentication"** → **"Policies"**
2. Check that each table has policies enabled
3. Look for lock icon 🔒 on tables in "Table Editor"

**Expected Policies:**
- Users can see only their own data
- Teachers see their own lesson plans/assignments
- Admins see all data

---

### STEP 5: Verify Environment Variables

Update your `.env` file in your project root:

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**How to get these:**

1. Go to Supabase Dashboard
2. Click **"Settings"** → **"API"**
3. Copy from "Project URL" section:
   - `URL` → VITE_SUPABASE_URL
   - `anon public` key → VITE_SUPABASE_ANON_KEY

---

## ✅ VERIFICATION CHECKLIST

### Database Tables ✓

Run this in SQL Editor to verify all tables exist:

```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

**Expected: 23 tables**

```
1. activity_logs
2. assignment_submissions
3. assignments
4. attendance
5. calendar_events
6. class_announcements
7. documents
8. grades
9. ilaw_lesson_plans
10. lesson_plans
11. memos
12. news
13. notifications
14. pre_enrollment
15. profiles
16. quiz_results
17. quizzes
18. schedules
19. school_settings
20. section_students
21. sections
22. students
23. worksheets
```

### Indexes ✓

Verify indexes were created:

```sql
SELECT indexname FROM pg_indexes 
WHERE schemaname = 'public' 
ORDER BY indexname;
```

**Expected: 50+ indexes**

### Triggers ✓

Verify timestamp triggers:

```sql
SELECT trigger_name FROM information_schema.triggers 
WHERE trigger_schema = 'public' 
ORDER BY trigger_name;
```

**Expected: 19 triggers** (one for each table with updated_at)

### Storage Buckets ✓

1. Go to **"Storage"** in Supabase
2. You should see 8 buckets listed:
   - ✓ lesson-pdfs
   - ✓ worksheets
   - ✓ assignment-submissions
   - ✓ student-documents
   - ✓ profile-photos
   - ✓ news-images
   - ✓ ilaw-exports
   - ✓ temporary-uploads

### Default Data ✓

Check school settings was inserted:

```sql
SELECT * FROM school_settings WHERE id = 1;
```

**Expected output:**
```
school_name: Dr. Paulino Ng National High School
school_year: 2025-2026
current_semester: 1
status: ✓
```

---

## 🧪 TEST DATA (Optional)

Create test data to verify everything works:

```sql
-- Insert test teacher
INSERT INTO profiles (id, email, name, role, status)
VALUES (
  gen_random_uuid(),
  'teacher@example.com',
  'John Doe',
  'teacher',
  'active'
);

-- Insert test student
INSERT INTO profiles (id, email, name, role, status)
VALUES (
  gen_random_uuid(),
  'student@example.com',
  'Jane Smith',
  'student',
  'active'
);

-- Insert test section
INSERT INTO sections (name, grade_level, school_year)
VALUES ('Grade 10 - Section A', 'Grade 10', '2025-2026');

-- Insert test lesson plan
INSERT INTO lesson_plans (teacher_id, title, subject, grade_level, objectives)
SELECT 
  id,
  'Introduction to Biology',
  'Science',
  'Grade 10',
  'Students will understand basic biology concepts'
FROM profiles WHERE role = 'teacher' LIMIT 1;
```

---

## 🪣 STORAGE BUCKET DETAILS

### Bucket 1: lesson-pdfs
```
Purpose: Store uploaded lesson plan PDFs
Path: {teacher_id}/{timestamp}_{random}.pdf
Access: PUBLIC
Max Size: 50MB
Auto-Cleanup: No (permanent)
```

### Bucket 2: worksheets
```
Purpose: Uploaded worksheets (PDF, DOCX, etc)
Path: {teacher_id}/{timestamp}_{random}.{ext}
Access: PUBLIC
Max Size: 50MB
Allowed Types: .pdf, .docx, .doc, .xlsx
```

### Bucket 3: assignment-submissions
```
Purpose: Student assignment submissions
Path: {student_id}/{assignment_id}/{timestamp}_{name}
Access: PRIVATE
Max Size: 50MB
Visibility: Student + Teacher + Admin only
```

### Bucket 4: student-documents
```
Purpose: Official documents (TOR, Diploma, etc)
Path: {student_id}/{doc_type}/{timestamp}_{name}
Access: PRIVATE
Max Size: 25MB
Visibility: Student + Admin only
```

### Bucket 5: profile-photos
```
Purpose: User profile pictures
Path: {user_id}/{timestamp}_{name}
Access: PUBLIC
Max Size: 10MB
Types: .jpg, .jpeg, .png, .webp
```

### Bucket 6: news-images
```
Purpose: News article images
Path: {author_id}/{timestamp}_{name}
Access: PUBLIC
Max Size: 20MB
Types: All image formats
```

### Bucket 7: ilaw-exports
```
Purpose: Exported lesson plans (PPT, PDF, Word)
Path: {teacher_id}/{lesson_id}/{format}_{timestamp}_{name}
Access: PUBLIC
Max Size: 100MB
Formats: .pptx, .pdf, .docx
```

### Bucket 8: temporary-uploads
```
Purpose: Work-in-progress files
Path: {user_id}/{timestamp}_{name}
Access: PRIVATE
Max Size: 100MB
Auto-Cleanup: 30 days
```

---

## 🔍 TROUBLESHOOTING

### Problem: Schema creation fails

**Solution:**
1. Check for error message in SQL Editor
2. Common issues:
   - UUID extension not enabled → Run: `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`
   - Table already exists → Run: `DROP TABLE IF EXISTS table_name CASCADE;` first
   - Syntax error → Copy-paste exact file content

### Problem: Storage buckets not created

**Solution:**
1. Try manual creation (Option B in Step 3)
2. Ensure you have admin access
3. Check bucket naming (lowercase, no spaces)

### Problem: Files can't be uploaded

**Solution:**
1. Verify bucket exists in Storage
2. Check RLS policies are set
3. Verify bucket is PUBLIC if needed
4. Check file size limit (50MB max)
5. Check file type is allowed

### Problem: Can't see data across tables

**Solution:**
1. Check RLS policies are correct
2. Verify you're logged in as correct role
3. Check foreign key relationships
4. Run: `SELECT * FROM information_schema.constraint_column_usage;`

### Problem: Performance is slow

**Solution:**
1. Verify all indexes were created
2. Run: `ANALYZE;` in SQL Editor
3. Check query logs for slow queries
4. Use materialized views for complex queries

---

## 📚 TABLE RELATIONSHIPS

```
profiles
  ├── profiles (role)
  ├── lesson_plans
  ├── worksheets
  ├── assignments
  ├── grades (teacher_id)
  ├── attendance (recorded_by)
  ├── quizzes
  ├── news
  ├── class_announcements
  ├── memos
  └── activity_logs

students
  ├── profiles (id, role='student')
  ├── section_students
  │   └── sections
  ├── grades
  ├── attendance
  ├── assignment_submissions
  ├── quiz_results
  ├── documents
  └── pre_enrollment

lessons/assignments/etc
  ├── teacher_id → profiles
  ├── section_id → sections
  └── students (via section_students)
```

---

## 🔐 SECURITY SUMMARY

### Enabled Features:
✅ Row Level Security (RLS)
✅ Authentication required for edits
✅ User data isolation
✅ Role-based access
✅ Audit logging
✅ Private buckets for sensitive files
✅ Public buckets for shared resources

### Best Practices:
- ✓ Change default passwords
- ✓ Enable 2FA for admins
- ✓ Regular backups
- ✓ Monitor activity logs
- ✓ Keep Supabase updated
- ✓ Review RLS policies quarterly

---

## 🚀 NEXT STEPS

1. ✅ Create database schema (COMPLETE_DATABASE_SCHEMA_v2.sql)
2. ✅ Create storage buckets (STORAGE_BUCKETS_CONFIGURATION.sql)
3. ✅ Update .env with Supabase credentials
4. ✅ Run your application
5. ✅ Create first admin user
6. ✅ Test file uploads
7. ✅ Create test data
8. ✅ Verify all features work

---

## 📞 SUPPORT

Files provided:
- `COMPLETE_DATABASE_SCHEMA_v2.sql` - Database creation
- `STORAGE_BUCKETS_CONFIGURATION.sql` - Storage setup
- `UPLOAD_FIX_CHECKLIST.md` - File upload verification
- `STORAGE_BUCKET_SETUP.md` - Bucket details

Questions? Check:
1. Supabase docs: https://supabase.com/docs
2. Error messages in SQL Editor
3. Browser console (F12) for frontend errors
4. Activity logs in Supabase dashboard

---

## ✅ COMPLETION STATUS

- [x] Database schema created
- [x] Storage buckets configured
- [x] RLS policies enabled
- [x] Indexes optimized
- [x] Triggers setup
- [x] Ready for production

🎉 **Your new database is ready to use!**
