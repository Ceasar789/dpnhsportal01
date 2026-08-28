-- ====================================================
-- VERIFICATION & QUICK FIX SCRIPT
-- Run this to check and fix your new database
-- ====================================================

-- ====================================================
-- 1. CHECK IF TABLES EXIST
-- ====================================================
SELECT 'Tables Check' as check_type, 
  COUNT(*) as table_count,
  CASE WHEN COUNT(*) >= 20 THEN '✅ Tables exist' ELSE '❌ Missing tables' END as status
FROM information_schema.tables 
WHERE table_schema = 'public';

-- ====================================================
-- 2. CHECK IF LESSON_PLANS TABLE HAS FILE COLUMNS
-- ====================================================
SELECT 'Lesson Plans Columns' as check_type,
  COUNT(*) as column_count,
  CASE WHEN COUNT(*) >= 15 THEN '✅ Table has columns' ELSE '❌ Missing columns' END as status
FROM information_schema.columns 
WHERE table_name = 'lesson_plans';

-- ====================================================
-- 3. CHECK IF STORAGE BUCKETS EXIST
-- ====================================================
SELECT 'Storage Buckets' as check_type,
  COUNT(*) as bucket_count,
  CASE WHEN COUNT(*) >= 8 THEN '✅ All buckets exist' 
       WHEN COUNT(*) > 0 THEN '⚠️ Some buckets missing'
       ELSE '❌ No buckets found' END as status
FROM storage.buckets;

-- ====================================================
-- 4. LIST ALL BUCKETS
-- ====================================================
SELECT name, id, public FROM storage.buckets ORDER BY name;

-- ====================================================
-- 5. LIST ALL TABLES
-- ====================================================
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- ====================================================
-- QUICK FIX: CREATE MISSING BUCKETS
-- ====================================================
-- Run these if buckets don't exist:

INSERT INTO storage.buckets (id, name, public) 
VALUES ('lesson-pdfs', 'lesson-pdfs', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('worksheets', 'worksheets', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('assignment-submissions', 'assignment-submissions', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('student-documents', 'student-documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('news-images', 'news-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('ilaw-exports', 'ilaw-exports', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('temporary-uploads', 'temporary-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- ====================================================
-- VERIFY BUCKETS CREATED
-- ====================================================
SELECT COUNT(*) as total_buckets FROM storage.buckets;
SELECT name, public FROM storage.buckets ORDER BY name;
