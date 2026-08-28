# Schema Update Instructions for Teacher Dashboard

## Overview
The schema has been enhanced with new tables and columns to support the Teacher Dashboard's full functionality. All changes are backward-compatible.

## What's New

### 1. **lesson_plans** table enhancements
Added columns for better lesson management:
- `status` - Draft/Completed/Published
- `ai_generated` - Track if lesson was AI-generated
- `ai_generated_at` - When AI generated it
- `strategy` - Teaching strategy used
- `pages` - Number of pages
- `items` - Number of items

### 2. **worksheets** table enhancements
Added columns for tracking worksheet distribution:
- `status` - Draft/Distributed
- `pages` - Number of pages
- `items` - Number of items/questions
- `ai_generated` - Track if AI-generated
- `ai_generated_at` - When generated

### 3. **assignments** table enhancements
Added columns for status tracking:
- `status` - Open/Due Today/Closed/Graded
- Enhanced `section_id` relationship

### 4. **NEW: notifications table**
Stores all notifications for teachers:
- `user_id` - Target teacher
- `title` - Notification title
- `message` - Notification message
- `notification_type` - ai/deadline/class/resource/general
- `read` - Read status
- `created_at` - Timestamp

### 5. **NEW: ai_usage_log table**
Tracks AI feature usage for analytics:
- `user_id` - Teacher using feature
- `feature_type` - lesson_plan_generator/worksheet_generator/etc
- `status` - success/error/pending
- `created_at` - When used

### 6. **NEW: teacher_load_summary table**
Quick view of teacher's workload:
- `teacher_id` - Which teacher
- `total_subjects` - Subjects taught
- `total_sections` - Sections assigned
- `total_students` - Students under them
- `total_lesson_plans` - Plans created
- `total_resources` - Resources uploaded
- `ai_suggestions_used` - AI count

## How to Apply Updates

### Option A: Using Supabase SQL Editor (RECOMMENDED)
1. Go to Supabase Dashboard → SQL Editor
2. Open file: `schema-updates.sql`
3. Copy all content
4. Paste into Supabase SQL Editor
5. Click "Run" button
6. Verify no errors appear

### Option B: Using Supabase CLI
```bash
# Make sure you're logged in
supabase login

# Apply migrations
supabase db push

# Or run the SQL directly
supabase db remote set --sql schema-updates.sql
```

### Option C: Manual - Copy & Paste by Section
If you want to apply sections individually:

#### Step 1: Update lesson_plans
```sql
ALTER TABLE lesson_plans 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Draft',
ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ai_generated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS strategy VARCHAR(255),
ADD COLUMN IF NOT EXISTS pages INT,
ADD COLUMN IF NOT EXISTS items INT;
```

#### Step 2: Update worksheets
```sql
ALTER TABLE worksheets 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Draft',
ADD COLUMN IF NOT EXISTS pages INT,
ADD COLUMN IF NOT EXISTS items INT,
ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ai_generated_at TIMESTAMP;
```

#### Step 3: Update assignments
```sql
ALTER TABLE assignments 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Open';
```

#### Step 4: Create notifications table
```sql
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  notification_type VARCHAR(50) NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, read);
```

#### Step 5: Create ai_usage_log table
```sql
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  feature_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'success',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_usage_user ON ai_usage_log(user_id);
```

#### Step 6: Create teacher_load_summary table
```sql
CREATE TABLE IF NOT EXISTS teacher_load_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  total_subjects INT DEFAULT 0,
  total_sections INT DEFAULT 0,
  total_students INT DEFAULT 0,
  total_lesson_plans INT DEFAULT 0,
  total_resources INT DEFAULT 0,
  ai_suggestions_used INT DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Verification

After applying updates, verify with these queries:

```sql
-- Check lesson_plans columns
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'lesson_plans';

-- Check if notifications table exists
SELECT * FROM notifications LIMIT 1;

-- Check if ai_usage_log exists
SELECT * FROM ai_usage_log LIMIT 1;

-- Check if teacher_load_summary exists
SELECT * FROM teacher_load_summary LIMIT 1;
```

## RLS Policies (Row Level Security)

Make sure to set up RLS policies in Supabase for these tables:

### For notifications table:
- Users can only read their own notifications
- Only the system/API can insert notifications for a user

### For ai_usage_log table:
- Users can only read their own usage logs
- Only the system/API can insert logs

### Example RLS Policy for notifications:
```sql
-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Read own notifications
CREATE POLICY "users_read_own_notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

-- Allow authenticated users to delete their read notifications
CREATE POLICY "users_delete_own_notifications" ON notifications
  FOR DELETE USING (auth.uid() = user_id);
```

## Testing

After schema updates, the Teacher Dashboard will:
1. ✅ Show real lesson plans with status
2. ✅ Track which lessons are AI-generated
3. ✅ Display real notifications
4. ✅ Show upcoming classes from schedule table
5. ✅ Display AI usage statistics

## Rollback (if needed)

If you need to revert changes:

```sql
-- Drop new tables
DROP TABLE IF EXISTS ai_usage_log CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS teacher_load_summary CASCADE;

-- Remove new columns (optional - they don't hurt to keep)
ALTER TABLE lesson_plans DROP COLUMN IF EXISTS status;
ALTER TABLE lesson_plans DROP COLUMN IF EXISTS ai_generated;
-- ... etc
```

---

**Status**: Ready to apply ✅
**Last Updated**: 2026-06-19
**Compatibility**: All existing data preserved
