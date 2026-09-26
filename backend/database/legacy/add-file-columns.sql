-- ====================================================
-- MIGRATION: Add missing file upload columns
-- ====================================================

-- Add columns to lesson_plans table
ALTER TABLE lesson_plans 
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_path TEXT,
ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS strategy VARCHAR(255),
ADD COLUMN IF NOT EXISTS duration VARCHAR(100);

-- Add columns to worksheets table
ALTER TABLE worksheets 
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_path TEXT,
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Draft',
ADD COLUMN IF NOT EXISTS pages VARCHAR(50),
ADD COLUMN IF NOT EXISTS items INT DEFAULT 0;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_lesson_plans_file_url ON lesson_plans(file_url);
CREATE INDEX IF NOT EXISTS idx_worksheets_file_url ON worksheets(file_url);

-- Add RLS policies for file uploads (if not exists)
ALTER TABLE lesson_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE worksheets ENABLE ROW LEVEL SECURITY;

-- Allow teachers to see their own lesson plans
CREATE POLICY IF NOT EXISTS "Teachers can view own lesson plans" 
ON lesson_plans FOR SELECT 
USING (teacher_id = auth.uid());

-- Allow teachers to insert own lesson plans
CREATE POLICY IF NOT EXISTS "Teachers can create lesson plans" 
ON lesson_plans FOR INSERT 
WITH CHECK (teacher_id = auth.uid());

-- Allow teachers to update own lesson plans
CREATE POLICY IF NOT EXISTS "Teachers can update own lesson plans" 
ON lesson_plans FOR UPDATE 
USING (teacher_id = auth.uid());

-- Allow teachers to delete own lesson plans
CREATE POLICY IF NOT EXISTS "Teachers can delete own lesson plans" 
ON lesson_plans FOR DELETE 
USING (teacher_id = auth.uid());

-- Similar for worksheets
CREATE POLICY IF NOT EXISTS "Teachers can view own worksheets" 
ON worksheets FOR SELECT 
USING (teacher_id = auth.uid());

CREATE POLICY IF NOT EXISTS "Teachers can create worksheets" 
ON worksheets FOR INSERT 
WITH CHECK (teacher_id = auth.uid());

CREATE POLICY IF NOT EXISTS "Teachers can update own worksheets" 
ON worksheets FOR UPDATE 
USING (teacher_id = auth.uid());

CREATE POLICY IF NOT EXISTS "Teachers can delete own worksheets" 
ON worksheets FOR DELETE 
USING (teacher_id = auth.uid());
