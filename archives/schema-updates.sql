-- ====================================================
-- SCHEMA UPDATES FOR TEACHER DASHBOARD
-- Adding missing fields and tables for complete functionality
-- ====================================================

-- ====================================================
-- PREREQUISITE: Create trigger function if not exists
-- ====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ====================================================
-- UPDATE 1: LESSON_PLANS TABLE - Add missing columns
-- ====================================================
ALTER TABLE IF EXISTS lesson_plans 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Draft' CHECK (status IN ('Draft', 'Completed', 'Published')),
ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ai_generated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS strategy VARCHAR(255),
ADD COLUMN IF NOT EXISTS pages INT,
ADD COLUMN IF NOT EXISTS items INT;

-- Add trigger for lesson_plans if not exists
DROP TRIGGER IF EXISTS update_lesson_plans_updated_at ON lesson_plans;
CREATE TRIGGER update_lesson_plans_updated_at BEFORE UPDATE ON lesson_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ====================================================
-- UPDATE 2: WORKSHEETS TABLE - Add missing columns
-- ====================================================
ALTER TABLE IF EXISTS worksheets 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Draft' CHECK (status IN ('Draft', 'Distributed')),
ADD COLUMN IF NOT EXISTS pages INT,
ADD COLUMN IF NOT EXISTS items INT,
ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ai_generated_at TIMESTAMP;

-- Add trigger for worksheets if not exists
DROP TRIGGER IF EXISTS update_worksheets_updated_at ON worksheets;
CREATE TRIGGER update_worksheets_updated_at BEFORE UPDATE ON worksheets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ====================================================
-- UPDATE 3: ASSIGNMENTS TABLE - Add missing columns
-- ====================================================
ALTER TABLE IF EXISTS assignments 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Open' CHECK (status IN ('Open', 'Due Today', 'Closed', 'Graded'));

-- Add trigger for assignments if not exists
DROP TRIGGER IF EXISTS update_assignments_updated_at ON assignments;
CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ====================================================
-- UPDATE 4: CREATE NOTIFICATIONS TABLE (NEW)
-- ====================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('ai', 'deadline', 'class', 'resource', 'general')),
  related_entity_type VARCHAR(100),
  related_entity_id UUID,
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  action_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type);

-- Add trigger for notifications
CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ====================================================
-- UPDATE 5: CREATE AI_USAGE_LOG TABLE (NEW) - For tracking AI features
-- ====================================================
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  feature_type VARCHAR(100) NOT NULL CHECK (feature_type IN ('lesson_plan_generator', 'worksheet_generator', 'assignment_generator', 'suggestion_engine')),
  entity_type VARCHAR(100),
  entity_id UUID,
  prompt_tokens INT,
  completion_tokens INT,
  status VARCHAR(50) DEFAULT 'success' CHECK (status IN ('success', 'error', 'pending')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for AI usage log
CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature ON ai_usage_log(feature_type);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage_log(created_at DESC);

-- Add trigger for ai_usage_log
CREATE TRIGGER update_ai_usage_log_updated_at BEFORE UPDATE ON ai_usage_log FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ====================================================
-- UPDATE 6: ENSURE SCHEDULES TABLE has proper teacher link
-- ====================================================
ALTER TABLE IF EXISTS schedules 
ADD COLUMN IF NOT EXISTS school_year VARCHAR(20) DEFAULT '2025-2026';

-- ====================================================
-- UPDATE 7: CREATE TEACHER_LOAD_SUMMARY TABLE (NEW)
-- ====================================================
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

-- Create index
CREATE INDEX IF NOT EXISTS idx_teacher_load_teacher ON teacher_load_summary(teacher_id);

-- Add trigger
CREATE TRIGGER update_teacher_load_summary_updated_at BEFORE UPDATE ON teacher_load_summary FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ====================================================
-- INSERT SAMPLE DATA FOR TESTING (Optional - Comment out if teacher doesn't exist)
-- ====================================================

-- NOTE: Only run these if you have teacher records in your profiles table
-- Uncomment the INSERT statements below if needed

-- Sample lesson plan with AI flag
-- INSERT INTO lesson_plans (teacher_id, title, subject, grade_level, duration_minutes, status, ai_generated, strategy, objectives, created_at)
-- VALUES 
-- (
--   (SELECT id FROM profiles WHERE role = 'teacher' LIMIT 1),
--   'Introduction to Fractions',
--   'Mathematics',
--   'Grade 6',
--   60,
--   'Completed',
--   TRUE,
--   'Cooperative Learning',
--   'Students will understand fractions and their applications',
--   CURRENT_TIMESTAMP
-- )
-- ON CONFLICT DO NOTHING;

-- Sample notifications
-- INSERT INTO notifications (user_id, title, message, notification_type, created_at)
-- VALUES
-- (
--   (SELECT id FROM profiles WHERE role = 'teacher' LIMIT 1),
--   'New AI suggestion available',
--   'AI has generated suggestions for your next lesson plan',
--   'ai',
--   CURRENT_TIMESTAMP - INTERVAL '15 minutes'
-- ),
-- (
--   (SELECT id FROM profiles WHERE role = 'teacher' LIMIT 1),
--   'Lesson Plan due today',
--   'Biology Lesson Plan #5 is due by 5 PM',
--   'deadline',
--   CURRENT_TIMESTAMP - INTERVAL '45 minutes'
-- ),
-- (
--   (SELECT id FROM profiles WHERE role = 'teacher' LIMIT 1),
--   'Upcoming class starts in 30 minutes',
--   'English 101 (Grade 9-A) starts at 08:00 AM in Room 201',
--   'class',
--   CURRENT_TIMESTAMP - INTERVAL '90 minutes'
-- ),
-- (
--   (SELECT id FROM profiles WHERE role = 'teacher' LIMIT 1),
--   'New resource processed',
--   'Your uploaded worksheet is ready for use',
--   'resource',
--   CURRENT_TIMESTAMP - INTERVAL '120 minutes'
-- )
-- ON CONFLICT DO NOTHING;

-- ====================================================
-- CONFIRM ALL UPDATES
-- ====================================================
-- Run these queries to verify all changes:
-- SELECT * FROM lesson_plans LIMIT 1;
-- SELECT * FROM worksheets LIMIT 1;
-- SELECT * FROM assignments LIMIT 1;
-- SELECT * FROM notifications LIMIT 1;
-- SELECT * FROM ai_usage_log LIMIT 1;
-- SELECT * FROM teacher_load_summary LIMIT 1;
