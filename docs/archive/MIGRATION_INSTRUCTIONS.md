# 🔧 DATABASE MIGRATION STEPS - ADD FILE UPLOAD COLUMNS

## ⚠️ PROBLEM IDENTIFIED:
The `lesson_plans` and `worksheets` tables are missing columns needed for file uploads:
- Missing: `file_url`, `file_name`, `file_path`, `ai_generated`, `strategy`, `status`

## ✅ HOW TO FIX:

### STEP 1: Open Supabase Dashboard
1. Go to: https://app.supabase.com
2. Select your project "SmartEdu_Portal"
3. Click on "SQL Editor" in the left sidebar

### STEP 2: Copy the Migration SQL
The SQL migration file is at: `add-file-columns.sql`

**Copy this entire SQL:**
```sql
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
```

### STEP 3: Paste and Execute
1. In SQL Editor, paste the SQL above
2. Click the blue "RUN" button
3. Wait for the results: ✅ "Success"

### STEP 4: Verify Columns Were Added
1. Go to "Table Editor" in Supabase
2. Select "lesson_plans" table
3. Scroll right to verify new columns:
   ✓ file_url
   ✓ file_name  
   ✓ file_path
   ✓ ai_generated
   ✓ strategy
   ✓ duration

4. Select "worksheets" table and verify:
   ✓ file_name
   ✓ file_path
   ✓ status
   ✓ pages
   ✓ items

## ✨ AFTER MIGRATION:
- File uploads will save to database ✅
- Files will display after upload ✅
- All metadata will be stored ✅

---

## 📊 COLUMN DEFINITIONS:

### lesson_plans table:
```
file_url TEXT          -- Public URL to the uploaded PDF file
file_name TEXT         -- Original filename (e.g., "Lesson.pdf")
file_path TEXT         -- Storage path (e.g., "user123/1234567890_abc.pdf")
ai_generated BOOLEAN   -- TRUE if created from PDF upload
strategy VARCHAR(255)  -- Teaching strategy used
duration VARCHAR(100)  -- Lesson duration (e.g., "60 minutes")
```

### worksheets table:
```
file_name TEXT         -- Original filename
file_path TEXT         -- Storage path
status VARCHAR(50)     -- 'Draft' or 'Distributed'
pages VARCHAR(50)      -- Number of pages
items INT              -- Number of items/questions
```

---

## ✅ TESTED & VERIFIED:
All columns use safe "IF NOT EXISTS" to avoid errors if running multiple times.
