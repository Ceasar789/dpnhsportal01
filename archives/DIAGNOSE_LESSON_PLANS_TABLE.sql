-- ====================================================
-- DIAGNOSE LESSON_PLANS TABLE
-- Run this to see what's wrong with uploads
-- ====================================================

-- Check if lesson_plans table exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_name = 'lesson_plans' AND table_schema = 'public'
) as "lesson_plans_exists";

-- Show all columns in lesson_plans table
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'lesson_plans' 
ORDER BY ordinal_position;

-- Show table size and record count
SELECT 
  'lesson_plans' as table_name,
  COUNT(*) as record_count
FROM lesson_plans;

-- Check for required columns
SELECT 
  CASE WHEN COUNT(*) FILTER (WHERE column_name = 'file_url') > 0 THEN '✅ file_url' ELSE '❌ file_url' END as file_url,
  CASE WHEN COUNT(*) FILTER (WHERE column_name = 'file_name') > 0 THEN '✅ file_name' ELSE '❌ file_name' END as file_name,
  CASE WHEN COUNT(*) FILTER (WHERE column_name = 'file_path') > 0 THEN '✅ file_path' ELSE '❌ file_path' END as file_path,
  CASE WHEN COUNT(*) FILTER (WHERE column_name = 'teacher_id') > 0 THEN '✅ teacher_id' ELSE '❌ teacher_id' END as teacher_id,
  CASE WHEN COUNT(*) FILTER (WHERE column_name = 'ai_generated') > 0 THEN '✅ ai_generated' ELSE '❌ ai_generated' END as ai_generated
FROM information_schema.columns 
WHERE table_name = 'lesson_plans';

-- Check for RLS policies on storage.buckets
SELECT policy_name, tablename, permissive, roles, qual, with_check 
FROM pg_policies 
WHERE tablename IN ('lesson-pdfs', 'worksheets') 
LIMIT 10;

-- Check bucket RLS status
SELECT bucket_id, count(*) as policy_count
FROM pg_policies 
WHERE tablename = 'lesson-pdfs'
GROUP BY bucket_id;
