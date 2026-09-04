-- Run once in the Supabase SQL Editor to support custom Calendar event labels.
ALTER TABLE public.calendar_events
ADD COLUMN IF NOT EXISTS custom_event_type VARCHAR(100);