-- Persistent settings and server-side backup history.
ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS two_factor_auth BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS session_timeout VARCHAR(20) DEFAULT '30 min',
  ADD COLUMN IF NOT EXISTS login_attempt_limit BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_backup BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS backup_frequency VARCHAR(20) DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS backup_time TIME DEFAULT '00:00',
  ADD COLUMN IF NOT EXISTS activity_logs_retention VARCHAR(20) DEFAULT '90 days';

CREATE TABLE IF NOT EXISTS public.backup_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  storage_path TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backup_history_started_at
  ON public.backup_history (started_at DESC);

ALTER TABLE public.backup_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_view_backup_history" ON public.backup_history;
CREATE POLICY "admins_view_backup_history"
ON public.backup_history FOR SELECT TO authenticated
USING (public.is_admin_user());

-- A scheduled Edge Function/pg_cron job should insert one row at the configured time.