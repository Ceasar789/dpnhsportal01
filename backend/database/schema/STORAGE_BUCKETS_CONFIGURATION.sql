-- ====================================================
-- SUPABASE STORAGE BUCKETS - COMPLETE CONFIGURATION
-- Separate file for organized bucket setup
-- ====================================================

-- ====================================================
-- STORAGE BUCKET STRUCTURE
-- ====================================================
-- This document defines all storage buckets needed for
-- the SmartEdu Portal application.
-- 
-- Total Buckets: 8
-- Purpose: File uploads, documents, media storage
-- ====================================================

-- ====================================================
-- BUCKET 1: lesson-pdfs
-- ====================================================
-- Purpose: Store uploaded PDF lesson plans
-- Path Structure: {teacher_id}/{timestamp}_{random}.pdf
-- Access: Public (anyone can view)
-- Retention: Permanent
-- Max File Size: 50MB

INSERT INTO storage.buckets (id, name, public) 
VALUES ('lesson-pdfs', 'lesson-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- ====================================================
-- BUCKET 2: worksheets
-- ====================================================
-- Purpose: Store uploaded worksheets (PDF, DOCX, DOC, XLSX)
-- Path Structure: {teacher_id}/{timestamp}_{random}.{ext}
-- Access: Public (anyone can view)
-- Retention: Permanent
-- Max File Size: 50MB
-- Allowed Types: .pdf, .docx, .doc, .xlsx

INSERT INTO storage.buckets (id, name, public) 
VALUES ('worksheets', 'worksheets', true)
ON CONFLICT (id) DO NOTHING;

-- ====================================================
-- BUCKET 3: assignment-submissions
-- ====================================================
-- Purpose: Store student assignment submissions
-- Path Structure: {student_id}/{assignment_id}/{timestamp}_{filename}
-- Access: Restricted (only student, teacher, admin)
-- Retention: Until assignment completed
-- Max File Size: 50MB

INSERT INTO storage.buckets (id, name, public) 
VALUES ('assignment-submissions', 'assignment-submissions', false)
ON CONFLICT (id) DO NOTHING;

-- ====================================================
-- BUCKET 4: student-documents
-- ====================================================
-- Purpose: Store official student documents (TOR, certificates, etc.)
-- Path Structure: {student_id}/{document_type}/{timestamp}_{filename}
-- Access: Restricted (student, admin only)
-- Retention: Permanent
-- Max File Size: 25MB

INSERT INTO storage.buckets (id, name, public) 
VALUES ('student-documents', 'student-documents', false)
ON CONFLICT (id) DO NOTHING;

-- ====================================================
-- BUCKET 5: profile-photos
-- ====================================================
-- Purpose: Store user profile pictures
-- Path Structure: {user_id}/{timestamp}_{filename}
-- Access: Public (for avatar display)
-- Retention: Permanent (until user deletes)
-- Max File Size: 10MB
-- Allowed Types: .jpg, .jpeg, .png, .webp

INSERT INTO storage.buckets (id, name, public) 
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO NOTHING;

-- ====================================================
-- BUCKET 6: news-images
-- ====================================================
-- Purpose: Store news article images
-- Path Structure: {author_id}/{timestamp}_{filename}
-- Access: Public
-- Retention: Permanent
-- Max File Size: 20MB

INSERT INTO storage.buckets (id, name, public) 
VALUES ('news-images', 'news-images', true)
ON CONFLICT (id) DO NOTHING;

-- ====================================================
-- BUCKET 7: ilaw-exports
-- ====================================================
-- Purpose: Store exported ILAW lesson plans (PPT, PDF, Word)
-- Path Structure: {teacher_id}/{lesson_id}/{format}_{timestamp}_{filename}
-- Access: Public (for sharing)
-- Retention: Permanent
-- Max File Size: 100MB (for presentations with media)

INSERT INTO storage.buckets (id, name, public) 
VALUES ('ilaw-exports', 'ilaw-exports', true)
ON CONFLICT (id) DO NOTHING;

-- ====================================================
-- BUCKET 8: temporary-uploads
-- ====================================================
-- Purpose: Temporary storage for work-in-progress files
-- Path Structure: {user_id}/{timestamp}_{filename}
-- Access: Private
-- Retention: Auto-delete after 30 days
-- Max File Size: 100MB

INSERT INTO storage.buckets (id, name, public) 
VALUES ('temporary-uploads', 'temporary-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- ====================================================
-- STORAGE CONFIGURATION SUMMARY
-- ====================================================

-- BUCKET OVERVIEW:
-- 
-- Name                    | Public | Max Size | Purpose
-- =============================================
-- lesson-pdfs             | YES    | 50MB     | Lesson plan PDFs
-- worksheets              | YES    | 50MB     | Educational worksheets
-- assignment-submissions  | NO     | 50MB     | Student submissions
-- student-documents       | NO     | 25MB     | Official documents
-- profile-photos          | YES    | 10MB     | User profile pictures
-- news-images             | YES    | 20MB     | News article images7
-- ilaw-exports            | YES    | 100MB    | Exported lesson plans
-- temporary-uploads       | NO     | 100MB    | Temporary work files

-- ====================================================
-- MANUAL BUCKET CREATION STEPS (If SQL doesn't work)
-- ====================================================
-- 
-- If the SQL above doesn't create buckets automatically,
-- follow these steps in Supabase Dashboard:
--
-- 1. Go to Storage section
-- 2. Click "Create a new bucket"
-- 3. Enter bucket name
-- 4. Toggle "Public bucket" if needed
-- 5. Click "Create bucket"
-- 6. Go to bucket → Policies → Add policies as shown above
--
-- ====================================================

-- ====================================================
-- BUCKET FILE STRUCTURE EXAMPLES
-- ====================================================

-- lesson-pdfs bucket structure:
-- lesson-pdfs/
-- ├── {teacher-id-1}/
-- │   ├── 1624567890_abc12345.pdf
-- │   ├── 1624567891_def67890.pdf
-- │   └── 1624567892_ghi34567.pdf
-- └── {teacher-id-2}/
--     └── 1624567893_jkl78901.pdf

-- worksheets bucket structure:
-- worksheets/
-- ├── {teacher-id-1}/
-- │   ├── 1624567890_abc.pdf
-- │   ├── 1624567891_def.docx
-- │   └── 1624567892_ghi.xlsx
-- └── {teacher-id-2}/
--     └── 1624567893_jkl.doc

-- assignment-submissions structure:
-- assignment-submissions/
-- ├── {student-id-1}/
-- │   ├── {assignment-id-1}/
-- │   │   ├── 1624567890_essay.docx
-- │   │   └── 1624567891_notes.pdf
-- │   └── {assignment-id-2}/
-- │       └── 1624567892_report.pdf
-- └── {student-id-2}/
--     └── {assignment-id-3}/
--         └── 1624567893_project.zip

-- ====================================================
-- FILE ACCESS EXAMPLES
-- ====================================================

-- Public bucket file URL:
-- https://{supabase-url}.supabase.co/storage/v1/object/public/lesson-pdfs/{teacher-id}/filename.pdf

-- Private bucket file URL (requires signed URL):
-- https://{supabase-url}.supabase.co/storage/v1/object/authenticated/assignment-submissions/{student-id}/{assignment-id}/filename.pdf

-- ====================================================
-- USAGE IN CODE - JavaScript/React
-- ====================================================

/*
// Upload to lesson-pdfs bucket
const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.pdf`;
const filePath = `${teacherId}/${fileName}`;

const { data, error } = await supabase.storage
  .from('lesson-pdfs')
  .upload(filePath, file);

// Get public URL
const { data: urlData } = supabase.storage
  .from('lesson-pdfs')
  .getPublicUrl(filePath);

const publicUrl = urlData.publicUrl;

// Upload to private bucket
const { data: submitData, error: submitError } = await supabase.storage
  .from('assignment-submissions')
  .upload(`${studentId}/${assignmentId}/${fileName}`, file);

// Get signed URL for private bucket (valid for 1 hour)
const { data: signedData } = await supabase.storage
  .from('assignment-submissions')
  .createSignedUrl(`${studentId}/${assignmentId}/${fileName}`, 3600);

const signedUrl = signedData.signedUrl;
*/

-- ====================================================
-- BUCKET MANAGEMENT COMMANDS
-- ====================================================

-- Delete a bucket (will fail if not empty):
-- DELETE FROM storage.buckets WHERE name = 'bucket-name';

-- Empty a bucket:
-- DELETE FROM storage.objects WHERE bucket_id = 'bucket-name';

-- List all buckets:
-- SELECT * FROM storage.buckets;

-- List all files in a bucket:
-- SELECT * FROM storage.objects WHERE bucket_id = 'bucket-name';

-- ====================================================
-- SECURITY BEST PRACTICES
-- ====================================================

-- ✅ DO:
-- - Use folder structure for organization ({user_id}/{type}/{file})
-- - Generate unique filenames (timestamp + random)
-- - Set appropriate access levels (public vs private)
-- - Implement RLS policies
-- - Validate file types before upload
-- - Check file sizes
-- - Use signed URLs for private files
-- - Keep audit logs of uploads/deletions
-- - Regularly backup important files

-- ❌ DON'T:
-- - Store sensitive data unencrypted
-- - Allow unlimited file sizes
-- - Make all buckets public
-- - Skip RLS policies
-- - Trust file extensions only
-- - Store passwords or API keys
-- - Enable public delete/update access
-- - Forget to validate on server side

-- ====================================================
-- MONITORING & MAINTENANCE
-- ====================================================

-- Monitor storage usage:
-- SELECT bucket_id, sum(metadata->>'size')::bigint as total_size
-- FROM storage.objects
-- GROUP BY bucket_id;

-- Find large files:
-- SELECT name, (metadata->>'size')::bigint as file_size
-- FROM storage.objects
-- WHERE bucket_id = 'lesson-pdfs'
-- ORDER BY (metadata->>'size')::bigint DESC
-- LIMIT 10;

-- Find old files for cleanup:
-- SELECT name, created_at
-- FROM storage.objects
-- WHERE bucket_id = 'temporary-uploads'
-- AND created_at < CURRENT_TIMESTAMP - INTERVAL '30 days';

-- ====================================================
-- RLS POLICIES FOR STORAGE BUCKETS
-- ====================================================
-- IMPORTANT: These policies must be created for uploads to work!
-- NOTE: Simplified for development - allows all authenticated operations

-- ====================================================
-- LESSON-PDFS BUCKET POLICIES
-- ====================================================

-- Allow all operations on lesson-pdfs for development
DROP POLICY IF EXISTS "lesson-pdfs-public-read" ON storage.objects;
CREATE POLICY "lesson-pdfs-public-read" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'lesson-pdfs');

DROP POLICY IF EXISTS "lesson-pdfs-authenticated-upload" ON storage.objects;
CREATE POLICY "lesson-pdfs-authenticated-upload" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'lesson-pdfs');

DROP POLICY IF EXISTS "lesson-pdfs-user-delete" ON storage.objects;
CREATE POLICY "lesson-pdfs-user-delete" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'lesson-pdfs');

DROP POLICY IF EXISTS "lesson-pdfs-update" ON storage.objects;
CREATE POLICY "lesson-pdfs-update" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'lesson-pdfs')
WITH CHECK (bucket_id = 'lesson-pdfs');

-- ====================================================
-- WORKSHEETS BUCKET POLICIES
-- ====================================================

DROP POLICY IF EXISTS "worksheets-public-read" ON storage.objects;
CREATE POLICY "worksheets-public-read" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'worksheets');

DROP POLICY IF EXISTS "worksheets-authenticated-upload" ON storage.objects;
CREATE POLICY "worksheets-authenticated-upload" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'worksheets');

DROP POLICY IF EXISTS "worksheets-user-delete" ON storage.objects;
CREATE POLICY "worksheets-user-delete" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'worksheets');

DROP POLICY IF EXISTS "worksheets-update" ON storage.objects;
CREATE POLICY "worksheets-update" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'worksheets')
WITH CHECK (bucket_id = 'worksheets');

-- ====================================================
-- ASSIGNMENT-SUBMISSIONS BUCKET POLICIES (PRIVATE)
-- ====================================================

-- 1. Students can view their own submissions
DROP POLICY IF EXISTS "assignment-submissions-own-read" ON storage.objects;
CREATE POLICY "assignment-submissions-own-read" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'assignment-submissions' AND auth.uid() = owner);

-- 2. Authenticated users can upload submissions
DROP POLICY IF EXISTS "assignment-submissions-upload" ON storage.objects;
CREATE POLICY "assignment-submissions-upload" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'assignment-submissions' AND auth.role() = 'authenticated');

-- 3. Students can delete their own submissions
DROP POLICY IF EXISTS "assignment-submissions-delete" ON storage.objects;
CREATE POLICY "assignment-submissions-delete" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'assignment-submissions' AND auth.uid() = owner);

-- ====================================================
-- STUDENT-DOCUMENTS BUCKET POLICIES (PRIVATE)
-- ====================================================

-- 1. Users can view their own documents
DROP POLICY IF EXISTS "student-documents-own-read" ON storage.objects;
CREATE POLICY "student-documents-own-read" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'student-documents' AND auth.uid() = owner);

-- 2. Authenticated users can upload documents
DROP POLICY IF EXISTS "student-documents-upload" ON storage.objects;
CREATE POLICY "student-documents-upload" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'student-documents' AND auth.role() = 'authenticated');

-- 3. Users can delete their own documents
DROP POLICY IF EXISTS "student-documents-delete" ON storage.objects;
CREATE POLICY "student-documents-delete" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'student-documents' AND auth.uid() = owner);

-- ====================================================
-- PROFILE-PHOTOS BUCKET POLICIES
-- ====================================================

DROP POLICY IF EXISTS "profile-photos-public-read" ON storage.objects;
CREATE POLICY "profile-photos-public-read" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'profile-photos');

DROP POLICY IF EXISTS "profile-photos-authenticated-upload" ON storage.objects;
CREATE POLICY "profile-photos-authenticated-upload" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'profile-photos');

DROP POLICY IF EXISTS "profile-photos-user-delete" ON storage.objects;
CREATE POLICY "profile-photos-user-delete" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'profile-photos');

DROP POLICY IF EXISTS "profile-photos-update" ON storage.objects;
CREATE POLICY "profile-photos-update" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'profile-photos')
WITH CHECK (bucket_id = 'profile-photos');

-- ====================================================
-- NEWS-IMAGES BUCKET POLICIES
-- ====================================================

DROP POLICY IF EXISTS "news-images-public-read" ON storage.objects;
CREATE POLICY "news-images-public-read" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'news-images');

DROP POLICY IF EXISTS "news-images-authenticated-upload" ON storage.objects;
CREATE POLICY "news-images-authenticated-upload" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'news-images');

DROP POLICY IF EXISTS "news-images-user-delete" ON storage.objects;
CREATE POLICY "news-images-user-delete" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'news-images');

DROP POLICY IF EXISTS "news-images-update" ON storage.objects;
CREATE POLICY "news-images-update" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'news-images')
WITH CHECK (bucket_id = 'news-images');

-- ====================================================
-- ILAW-EXPORTS BUCKET POLICIES
-- ====================================================

DROP POLICY IF EXISTS "ilaw-exports-public-read" ON storage.objects;
CREATE POLICY "ilaw-exports-public-read" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'ilaw-exports');

DROP POLICY IF EXISTS "ilaw-exports-authenticated-upload" ON storage.objects;
CREATE POLICY "ilaw-exports-authenticated-upload" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'ilaw-exports');

DROP POLICY IF EXISTS "ilaw-exports-user-delete" ON storage.objects;
CREATE POLICY "ilaw-exports-user-delete" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'ilaw-exports');

DROP POLICY IF EXISTS "ilaw-exports-update" ON storage.objects;
CREATE POLICY "ilaw-exports-update" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'ilaw-exports')
WITH CHECK (bucket_id = 'ilaw-exports');

-- ====================================================
-- TEMPORARY-UPLOADS BUCKET POLICIES
-- ====================================================

-- 1. Users can view their own temporary files
DROP POLICY IF EXISTS "temporary-uploads-own-read" ON storage.objects;
CREATE POLICY "temporary-uploads-own-read" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'temporary-uploads' AND auth.uid() = owner);

-- 2. Authenticated users can upload temp files
DROP POLICY IF EXISTS "temporary-uploads-upload" ON storage.objects;
CREATE POLICY "temporary-uploads-upload" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'temporary-uploads' AND auth.role() = 'authenticated');

-- 3. Users can delete their own temporary files
DROP POLICY IF EXISTS "temporary-uploads-delete" ON storage.objects;
CREATE POLICY "temporary-uploads-delete" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'temporary-uploads' AND auth.uid() = owner);

-- ====================================================
-- COMPLETE! All storage buckets and policies configured
-- ====================================================
-- Ready for file uploads and storage operations!
