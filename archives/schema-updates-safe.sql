-- ====================================================
-- SCHEMA UPDATES FOR TEACHER DASHBOARD - SAFE VERSION
-- Run each section individually or all together
-- ====================================================

-- STEP 1: Create trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 2: Update lesson_plans
ALTER TABLE IF EXISTS lesson_plans 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Draft',
ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ai_generated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS strategy VARCHAR(255),
ADD COLUMN IF NOT EXISTS pages INT,
ADD COLUMN IF NOT EXISTS items INT;

-- STEP 3: Update worksheets
ALTER TABLE IF EXISTS worksheets 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Draft',
ADD COLUMN IF NOT EXISTS pages INT,
ADD COLUMN IF NOT EXISTS items INT,
ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ai_generated_at TIMESTAMP;

-- STEP 4: Update assignments
ALTER TABLE IF EXISTS assignments 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Open';

-- STEP 5: Update schedules
ALTER TABLE IF EXISTS schedules 
ADD COLUMN IF NOT EXISTS school_year VARCHAR(20) DEFAULT '2025-2026';

-- STEP 6: Create notifications table (simplified)
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

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- STEP 7: Create ai_usage_log table (simplified)
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  feature_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'success',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage_log(created_at DESC);

-- STEP 8: Create teacher_load_summary table
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

CREATE INDEX IF NOT EXISTS idx_teacher_load_teacher ON teacher_load_summary(teacher_id);

-- STEP 9: Drop old triggers (safe cleanup)
DROP TRIGGER IF EXISTS update_lesson_plans_updated_at ON lesson_plans;
DROP TRIGGER IF EXISTS update_worksheets_updated_at ON worksheets;
DROP TRIGGER IF EXISTS update_assignments_updated_at ON assignments;
DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications;
DROP TRIGGER IF EXISTS update_ai_usage_log_updated_at ON ai_usage_log;
DROP TRIGGER IF EXISTS update_teacher_load_summary_updated_at ON teacher_load_summary;

-- STEP 10: Create new triggers
CREATE TRIGGER update_lesson_plans_updated_at BEFORE UPDATE ON lesson_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_worksheets_updated_at BEFORE UPDATE ON worksheets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_usage_log_updated_at BEFORE UPDATE ON ai_usage_log FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_teacher_load_summary_updated_at BEFORE UPDATE ON teacher_load_summary FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ====================================================
-- VERIFICATION QUERIES (run these to check)
-- ====================================================
-- SELECT column_name FROM information_schema.columns WHERE table_name='lesson_plans' AND column_name='ai_generated';
-- SELECT column_name FROM information_schema.columns WHERE table_name='notifications' AND column_name='notification_type';
-- SELECT * FROM notifications LIMIT 0;
-- SELECT * FROM ai_usage_log LIMIT 0;
-- SELECT * FROM teacher_load_summary LIMIT 0;
